// Polyfill de `Worker` pour Node : fait tourner le vrai python-worker.js (via worker-shim.mjs) derrière
// l'interface que PyodideWorkerClient attend dans un navigateur. Pyodide réel, aucune simulation.
import { Worker as NodeThread } from 'node:worker_threads';

const root = new URL('../../../', import.meta.url).pathname;

export function installNodeWorker() {
    globalThis.crossOriginIsolated = true; // active SharedArrayBuffer (interruption et input)
    globalThis.Worker = class {
        #thread = new NodeThread(new URL('./worker-shim.mjs', import.meta.url), {
            workerData: { workerPath: `${root}app/js/workers/python-worker.js`, runnerPath: `${root}app/python/pyquest_runner.py` },
        });

        addEventListener(type, listener) {
            if (type === 'message') this.#thread.on('message', (data) => listener({ data }));
            if (type === 'error') this.#thread.on('error', (error) => listener({ message: error.message }));
        }

        postMessage(message) {
            this.#thread.postMessage(message);
        }

        terminate() {
            return this.#thread.terminate();
        }
    };
    return { indexURL: `${root}vendor/pyodide/` };
}
