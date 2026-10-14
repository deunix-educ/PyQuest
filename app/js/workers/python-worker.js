// Worker du moteur Python : charge Pyodide (vendorisé) et exécute le code des cellules.
//
// Protocole (messages entrants) :
//   { type: 'init', indexURL, interruptBuffer?, inputBuffer? }  charge Pyodide ; répond 'ready' ou 'init_error'
//   { type: 'run_code', id, code, collect?, isolated? }  exécute une cellule ; répond 'result'
//   { type: 'reset' }                             vide l'espace de noms Python
//
// Messages sortants :
//   { type: 'ready', interruptible }
//   { type: 'init_error', message }
//   { type: 'stdout' | 'stderr', id, text }       flux brut, au fil de l'exécution
//   { type: 'input_request', id, prompt }         input() attend une réponse (voir ci-dessous)
//   { type: 'result', id, ok, error, variables }  error = { type, message, lineno, traceback }
//
// Interruption : pas de message 'interrupt'. Pendant qu'une cellule tourne, le worker est
// occupé et ne lirait pas ses messages ; le client écrit donc 2 (SIGINT) directement dans le
// SharedArrayBuffer fourni à 'init'. Python lève alors KeyboardInterrupt dans la cellule.

// Saisie (input) : le worker est bloqué dans Python pendant input(), il ne peut donc pas lire de
// message. Le client répond via un SharedArrayBuffer : Int32[0] = état (0 attente, 1 réponse,
// 2 fin de saisie/EOF), Int32[1] = longueur en octets, puis le texte UTF-8 à partir de l'octet 8.
const SIGINT = 2;
const INPUT_WAIT_SLICE_MS = 50;
const INPUT_HEADER_BYTES = 8;
const INPUT_STATE_ANSWER = 1;

class PythonWorker {
    #pyodide = null;
    #runner = null;
    #interruptView = null;
    #inputControl = null;
    #inputData = null;
    #currentId = null;
    #ready = null;

    constructor() {
        self.addEventListener('message', (event) => this.#onMessage(event.data));
    }

    #onMessage(message) {
        switch (message.type) {
            case 'init':
                this.#ready = this.#init(message);
                break;
            case 'run_code':
                this.#run(message);
                break;
            case 'reset':
                this.#reset();
                break;
        }
    }

    async #init({ indexURL, interruptBuffer, inputBuffer }) {
        try {
            // Import dynamique : le worker est de type module, Pyodide est servi en local (COEP).
            const { loadPyodide } = await import(`${indexURL}pyodide.mjs`);
            this.#pyodide = await loadPyodide({ indexURL });

            // La sortie arrive en octets bruts : on garde les retours à la ligne exacts,
            // indispensables pour le test stdout_equals.
            this.#pyodide.setStdout({ write: (bytes) => this.#emit('stdout', bytes) });
            this.#pyodide.setStderr({ write: (bytes) => this.#emit('stderr', bytes) });
            // input() n'est pas supporté en synchrone : lecture immédiate de fin de fichier.
            this.#pyodide.setStdin({ stdin: () => null });

            const source = await (await fetch(new URL('../../python/pyquest_runner.py', import.meta.url))).text();
            this.#pyodide.FS.mkdirTree('/pyquest');
            this.#pyodide.FS.writeFile('/pyquest/pyquest_runner.py', source);
            this.#pyodide.runPython("import sys; sys.path.insert(0, '/pyquest')");
            this.#runner = this.#pyodide.pyimport('pyquest_runner');

            // Sans SharedArrayBuffer, pas de saisie : input() lève EOFError (comportement par défaut).
            if (inputBuffer instanceof SharedArrayBuffer) {
                this.#inputControl = new Int32Array(inputBuffer, 0, 2);
                this.#inputData = new Uint8Array(inputBuffer, INPUT_HEADER_BYTES);
                this.#runner.set_input_bridge((prompt) => this.#requestInput(prompt));
            }

            // Sans SharedArrayBuffer (page non isolée), pas d'interruption propre :
            // le client doit alors se rabattre sur worker.terminate().
            let interruptible = false;
            if (interruptBuffer instanceof SharedArrayBuffer) {
                this.#interruptView = new Uint8Array(interruptBuffer);
                this.#pyodide.setInterruptBuffer(this.#interruptView);
                interruptible = true;
            }
            self.postMessage({ type: 'ready', interruptible });
        } catch (error) {
            self.postMessage({ type: 'init_error', message: String(error?.message ?? error) });
            throw error;
        }
    }

    #emit(stream, bytes) {
        // `stream: true` gère les caractères UTF-8 coupés entre deux écritures.
        const decoder = this.#decoders[stream];
        const text = decoder.decode(bytes, { stream: true });
        if (text !== '') {
            self.postMessage({ type: stream, id: this.#currentId, text });
        }
        return bytes.length;
    }

    #decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };

    /** Bloque jusqu'à la réponse de l'apprenant. Renvoie le JSON attendu par pyquest_runner. */
    #requestInput(prompt) {
        const control = this.#inputControl;
        Atomics.store(control, 0, 0);
        self.postMessage({ type: 'input_request', id: this.#currentId, prompt });
        // Attente par tranches : permet de réagir à une interruption pendant la saisie.
        while (Atomics.load(control, 0) === 0) {
            if (this.#interruptView?.[0] === SIGINT) {
                break;
            }
            Atomics.wait(control, 0, 0, INPUT_WAIT_SLICE_MS);
        }
        // L'interruption prime sur une réponse arrivée dans la même tranche.
        if (this.#interruptView?.[0] === SIGINT) {
            this.#interruptView[0] = 0;
            return JSON.stringify({ status: 'interrupted' });
        }
        if (Atomics.load(control, 0) !== INPUT_STATE_ANSWER) {
            return JSON.stringify({ status: 'eof' });
        }
        // TextDecoder refuse certaines vues sur SharedArrayBuffer : copie préalable.
        const bytes = this.#inputData.slice(0, Atomics.load(control, 1));
        return JSON.stringify({ status: 'ok', text: new TextDecoder().decode(bytes) });
    }

    async #run({ id, code, collect = [], isolated = false }) {
        try {
            await this.#ready;
        } catch {
            self.postMessage({ type: 'result', id, ok: false, variables: {}, error: this.#internalError('Pyodide not ready') });
            return;
        }
        this.#currentId = id;
        // Remet le tampon à zéro : une interruption tardive ne doit pas tuer la cellule suivante.
        if (this.#interruptView) {
            this.#interruptView[0] = 0;
        }
        try {
            const raw = this.#runner.run_cell(code, JSON.stringify(collect), isolated);
            self.postMessage({ type: 'result', id, ...JSON.parse(raw) });
        } catch (error) {
            // Erreur hors du code de l'apprenant (bug du runner ou de Pyodide).
            self.postMessage({ type: 'result', id, ok: false, variables: {}, error: this.#internalError(error) });
        } finally {
            if (this.#interruptView) {
                this.#interruptView[0] = 0;
            }
            this.#currentId = null;
        }
    }

    #reset() {
        this.#ready?.then(() => this.#runner.reset_namespace()).catch(() => {});
    }

    #internalError(error) {
        const message = String(error?.message ?? error);
        return { type: 'InternalError', message, lineno: null, traceback: message };
    }
}

new PythonWorker();
