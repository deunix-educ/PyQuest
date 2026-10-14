// Worker du moteur Python : charge Pyodide (vendorisé) et exécute le code des cellules.
//
// Protocole (messages entrants) :
//   { type: 'init', indexURL, interruptBuffer? }  charge Pyodide ; répond 'ready' ou 'init_error'
//   { type: 'run_code', id, code, collect? }      exécute une cellule ; répond 'result'
//   { type: 'reset' }                             vide l'espace de noms Python
//
// Messages sortants :
//   { type: 'ready', interruptible }
//   { type: 'init_error', message }
//   { type: 'stdout' | 'stderr', id, text }       flux brut, au fil de l'exécution
//   { type: 'result', id, ok, error, variables }  error = { type, message, lineno, traceback }
//
// Interruption : pas de message 'interrupt'. Pendant qu'une cellule tourne, le worker est
// occupé et ne lirait pas ses messages ; le client écrit donc 2 (SIGINT) directement dans le
// SharedArrayBuffer fourni à 'init'. Python lève alors KeyboardInterrupt dans la cellule.

const SIGINT = 2;

class PythonWorker {
    #pyodide = null;
    #runner = null;
    #interruptView = null;
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

    async #init({ indexURL, interruptBuffer }) {
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

    async #run({ id, code, collect = [] }) {
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
            const raw = this.#runner.run_cell(code, JSON.stringify(collect));
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
