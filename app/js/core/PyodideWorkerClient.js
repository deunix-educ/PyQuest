// Client du worker Python, côté thread principal : seule frontière qui parle à Python.
// Protocole des messages : voir app/js/workers/python-worker.js.

const SIGINT = 2;
// Délai après lequel une interruption qui n'aboutit pas est remplacée par un terminate().
const INTERRUPT_GRACE_MS = 2000;

export class PyodideWorkerClient {
    #workerUrl;
    #indexURL;
    #worker = null;
    #interruptView = null;
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
     * @returns {Promise<{ok: boolean, error: object|null, variables: object}>}
     */
    async run(code, { collect = [], onStdout = () => {}, onStderr = () => {} } = {}) {
        await this.start();
        const id = this.#nextId++;
        return new Promise((resolve) => {
            this.#pending.set(id, { resolve, onStdout, onStderr });
            this.#worker.postMessage({ type: 'run_code', id, code, collect });
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

        this.#worker = new Worker(this.#workerUrl, { type: 'module' });
        this.#worker.addEventListener('message', (event) => this.#onMessage(event.data));
        this.#worker.addEventListener('error', (event) => this.#readyHandlers?.reject(new Error(event.message)));

        return new Promise((resolve, reject) => {
            this.#readyHandlers = { resolve, reject };
            this.#worker.postMessage({ type: 'init', indexURL: this.#indexURL, interruptBuffer: buffer });
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
