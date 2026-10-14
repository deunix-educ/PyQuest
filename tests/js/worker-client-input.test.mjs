// Client : réponse à input() via le SharedArrayBuffer partagé avec le worker.
import { PyodideWorkerClient } from '../../app/js/core/PyodideWorkerClient.js';
import assert from 'node:assert';

globalThis.crossOriginIsolated = true;

let inputBuffer = null;
globalThis.Worker = class {
    constructor() {
        this.listeners = {};
    }
    addEventListener(type, listener) {
        this.listeners[type] = listener;
    }
    terminate() {}
    postMessage(message) {
        const reply = (data) => queueMicrotask(() => this.listeners.message({ data }));
        if (message.type === 'init') {
            inputBuffer = message.inputBuffer;
            reply({ type: 'ready', interruptible: true });
        }
        if (message.type === 'run_code') {
            reply({ type: 'input_request', id: message.id, prompt: 'Nom ? ' });
            // Le vrai worker attend l'état ; ici on termine la cellule après un délai.
            setTimeout(() => reply({ type: 'result', id: message.id, ok: true, error: null, variables: {} }), 20);
        }
    }
};

const client = new PyodideWorkerClient({ indexURL: '/v/', workerUrl: 'x' });
const prompts = [];
await client.run('ask', { onInput: async (prompt) => (prompts.push(prompt), 'héé') });
await new Promise((resolve) => setTimeout(resolve, 10));
const control = new Int32Array(inputBuffer, 0, 2);
assert.deepEqual(prompts, ['Nom ? ']);
assert.equal(Atomics.load(control, 0), 1);
assert.equal(new TextDecoder().decode(new Uint8Array(inputBuffer, 8, Atomics.load(control, 1))), 'héé');

// Sans gestionnaire : fin de saisie.
await client.run('ask');
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(Atomics.load(control, 0), 2);
client.dispose();
console.log('client input ok');
