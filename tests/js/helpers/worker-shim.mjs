// Exécuté dans un worker_threads : émule l'environnement navigateur minimal attendu par
// python-worker.js (self, fetch de file://) pour le tester sous Node avec le vrai Pyodide.
import { parentPort, workerData } from 'node:worker_threads';
import { readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const listeners = [];
globalThis.self = {
    addEventListener: (type, listener) => listeners.push(listener),
    postMessage: (message) => parentPort.postMessage(message),
};
// Les messages reçus avant le chargement du worker sont mis en file puis rejoués.
const queue = [];
let loaded = false;
parentPort.on('message', (data) => {
    if (loaded) {
        listeners.forEach((listener) => listener({ data }));
    } else {
        queue.push(data);
    }
});

// Le runner Python est demandé par URL relative au worker : on le redirige vers le fichier réel.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, ...rest) => {
    if (String(input).includes('pyquest_runner.py')) {
        const text = await readFile(workerData.runnerPath, 'utf8');
        return { ok: true, text: async () => text };
    }
    return realFetch(input, ...rest);
};

// Node lit un .js sans package.json comme CommonJS : on charge une copie .mjs du worker.
const copy = join(tmpdir(), `pyquest-worker-${process.pid}.mjs`);
await copyFile(workerData.workerPath, copy);
await import(pathToFileURL(copy).href);
loaded = true;
queue.splice(0).forEach((data) => listeners.forEach((listener) => listener({ data })));
