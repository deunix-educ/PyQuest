// Client du worker Python, côté thread principal : seule frontière qui parle à Python.
// Protocole des messages : voir app/js/workers/python-worker.js.

const SIGINT = 2;
// Zone de réponse à input() : 8 octets d'en-tête (état, longueur) puis le texte UTF-8.
const INPUT_HEADER_BYTES = 8;
const INPUT_MAX_BYTES = 4096;
const INPUT_STATE_ANSWER = 1;
const INPUT_STATE_EOF = 2;
// Délai après lequel une interruption qui n'aboutit pas est remplacée par un terminate().
const INTERRUPT_GRACE_MS = 2000;

export class PyodideWorkerClient {
    #workerUrl;
    #indexURL;
    #worker = null;
    #interruptView = null;
    #inputControl = null;
    #inputData = null;
    #interruptible = false;
    #ready = null;
    #readyHandlers = null;
    #pending = new Map();
    #nextId = 1;
    #graceTimer = null;

    /**
     * @param {object} options
     * @param {string} options.indexURL  Dossier de Pyodide vendorisé, avec slash final.
     * @param {URL|string} [options.workerUrl]  Script du worker.
     */
    constructor({ indexURL, workerUrl = new URL('../workers/python-worker.js', import.meta.url) }) {
        this.#indexURL = indexURL;
        this.#workerUrl = workerUrl;
    }

    /** Vrai si l'arrêt propre (SharedArrayBuffer) est disponible. */
    get interruptible() {
        return this.#interruptible;
    }

    /** Démarre le worker (idempotent). Résout quand Pyodide est prêt. */
    start() {
        if (!this.#ready) {
            this.#ready = this.#spawn();
        }
        return this.#ready;
    }

    /**
     * Exécute une cellule.
     * @param {string} code
     * @param {object} [options]
     * @param {string[]} [options.collect]  Variables à relire après l'exécution.
     * @param {(text: string) => void} [options.onStdout]
     * @param {(text: string) => void} [options.onStderr]
     * @param {(prompt: string) => Promise<string|null>} [options.onInput]  Répond à input() ;
     *        null ou absent = fin de saisie (EOFError côté Python).
     * @param {boolean} [options.isolated]  Exécute sur une copie de l'état, sans le modifier.
     * @returns {Promise<{ok: boolean, error: object|null, variables: object}>}
     */
    async run(code, { collect = [], onStdout = () => {}, onStderr = () => {}, onInput = null, isolated = false } = {}) {
        await this.start();
        const id = this.#nextId++;
        return new Promise((resolve) => {
            this.#pending.set(id, { resolve, onStdout, onStderr, onInput });
            this.#worker.postMessage({ type: 'run_code', id, code, collect, isolated });
        });
    }

    /** Vide l'espace de noms Python. */
    async reset() {
        await this.start();
        this.#worker.postMessage({ type: 'reset' });
    }

    /** Interrompt la cellule en cours (boucle infinie, etc.). Sans effet si rien ne tourne. */
    interrupt() {
        if (this.#pending.size === 0) {
            return;
        }
        if (!this.#interruptible) {
            this.#hardRestart();
            return;
        }
        this.#interruptView[0] = SIGINT;
        // Filet de sécurité : si Python ne réagit pas, on repart d'un worker neuf.
        clearTimeout(this.#graceTimer);
        this.#graceTimer = setTimeout(() => this.#hardRestart(), INTERRUPT_GRACE_MS);
    }

    /** Arrête définitivement le worker. */
    dispose() {
        clearTimeout(this.#graceTimer);
        this.#worker?.terminate();
        this.#worker = null;
        this.#ready = null;
        this.#failPending();
    }

    #spawn() {
        // SharedArrayBuffer n'existe que si la page est isolée (COOP/COEP).
        const canShare = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
        const buffer = canShare ? new SharedArrayBuffer(1) : null;
        this.#interruptView = buffer ? new Uint8Array(buffer) : null;
        const inputBuffer = canShare ? new SharedArrayBuffer(INPUT_HEADER_BYTES + INPUT_MAX_BYTES) : null;
        this.#inputControl = inputBuffer ? new Int32Array(inputBuffer, 0, 2) : null;
        this.#inputData = inputBuffer ? new Uint8Array(inputBuffer, INPUT_HEADER_BYTES) : null;

        this.#worker = new Worker(this.#workerUrl, { type: 'module' });
        this.#worker.addEventListener('message', (event) => this.#onMessage(event.data));
        this.#worker.addEventListener('error', (event) => this.#readyHandlers?.reject(new Error(event.message)));

        return new Promise((resolve, reject) => {
            this.#readyHandlers = { resolve, reject };
            this.#worker.postMessage({ type: 'init', indexURL: this.#indexURL, interruptBuffer: buffer, inputBuffer });
        });
    }

    #onMessage(message) {
        switch (message.type) {
            case 'ready':
                this.#interruptible = message.interruptible;
                this.#readyHandlers?.resolve({ interruptible: message.interruptible });
                break;
            case 'init_error':
                this.#ready = null;
                this.#readyHandlers?.reject(new Error(message.message));
                break;
            case 'stdout':
                this.#pending.get(message.id)?.onStdout(message.text);
                break;
            case 'stderr':
                this.#pending.get(message.id)?.onStderr(message.text);
                break;
            case 'input_request':
                this.#answerInput(message);
                break;
            case 'result': {
                const entry = this.#pending.get(message.id);
                if (entry) {
                    this.#pending.delete(message.id);
                    const { type, id, ...result } = message;
                    entry.resolve(result);
                }
                if (this.#pending.size === 0) {
                    clearTimeout(this.#graceTimer);
                }
                break;
            }
        }
    }

    /** Transmet la réponse de l'apprenant au worker bloqué dans input(). */
    async #answerInput({ id, prompt }) {
        const worker = this.#worker;
        const handler = this.#pending.get(id)?.onInput;
        let answer = null;
        try {
            answer = handler ? await handler(prompt) : null;
        } catch {
            answer = null;
        }
        // Le worker a pu être remplacé (interruption forcée) pendant l'attente.
        if (worker !== this.#worker || !this.#inputControl) {
            return;
        }
        let length = 0;
        if (answer !== null) {
            // encodeInto refuse une vue sur SharedArrayBuffer (navigateurs) : on encode d'abord en
            // mémoire locale, en ne gardant que des caractères entiers, puis on recopie.
            const local = new Uint8Array(INPUT_MAX_BYTES);
            length = new TextEncoder().encodeInto(answer, local).written;
            this.#inputData.set(local.subarray(0, length));
        }
        Atomics.store(this.#inputControl, 1, length);
        Atomics.store(this.#inputControl, 0, answer === null ? INPUT_STATE_EOF : INPUT_STATE_ANSWER);
        Atomics.notify(this.#inputControl, 0);
    }

    /** Termine le worker, rejoue les cellules en attente comme interrompues, puis le recrée. */
    #hardRestart() {
        clearTimeout(this.#graceTimer);
        this.#worker?.terminate();
        this.#failPending();
        // L'espace de noms Python est perdu : le prochain run() repart de zéro.
        this.#ready = null;
        this.#worker = null;
        this.#interruptible = false;
        this.start().catch(() => {});
    }

    #failPending() {
        const error = { type: 'KeyboardInterrupt', message: '', lineno: null, traceback: 'KeyboardInterrupt' };
        for (const { resolve } of this.#pending.values()) {
            resolve({ ok: false, error, variables: {} });
        }
        this.#pending.clear();
    }
}
