// Test d'intégration : le vrai python-worker.js avec le vrai Pyodide (vendor/pyodide requis).
// Ignoré si Pyodide n'est pas installé (make vendor-pyodide).
import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert';

const root = new URL('../../', import.meta.url).pathname;
const indexURL = `${root}vendor/pyodide/`;

test('worker Python sous Pyodide', { skip: !existsSync(`${indexURL}pyodide.mjs`) && 'vendor/pyodide absent' }, async () => {
    const worker = new Worker(new URL('./helpers/worker-shim.mjs', import.meta.url), {
        workerData: { workerPath: `${root}app/js/workers/python-worker.js`, runnerPath: `${root}app/python/pyquest_runner.py` },
    });
    const interruptBuffer = new SharedArrayBuffer(1);
    const waiters = new Map();
    const stdout = [];
    worker.on('message', (message) => {
        if (message.type === 'stdout') stdout.push(message.text);
        const key = message.type === 'result' ? message.id : 'init';
        if (['result', 'ready', 'init_error'].includes(message.type)) waiters.get(key)?.(message);
    });
    const wait = (key) =>
        new Promise((resolve, reject) => {
            waiters.set(key, resolve);
            worker.once('error', reject);
        });
    const run = (id, code, collect = []) => {
        const done = wait(id);
        worker.postMessage({ type: 'run_code', id, code, collect });
        return done;
    };

    try {
        const init = wait('init');
        worker.postMessage({ type: 'init', indexURL, interruptBuffer });
        assert.deepEqual(await init, { type: 'ready', interruptible: true });

        let result = await run(1, 'x = 10.0\nprint("hé")\nprint(x)', ['x']);
        assert.equal(result.ok, true);
        assert.deepEqual(stdout.join(''), 'hé\n10.0\n');
        assert.deepEqual(result.variables.x, { type: 'float', repr: '10.0', value: 10 });

        result = await run(2, 'print(nom)');
        assert.deepEqual([result.error.type, result.error.lineno], ['NameError', 1]);

        result = await run(3, 'y = x + 1', ['y']); // l'espace de noms persiste
        assert.equal(result.variables.y.value, 11);

        result = await run(4, 'input("?")');
        assert.equal(result.error.type, 'EOFError');

        const looping = run(5, 'while True:\n    pass');
        setTimeout(() => (new Uint8Array(interruptBuffer)[0] = 2), 500);
        assert.equal((await looping).error.type, 'KeyboardInterrupt');

        result = await run(6, 'print("après")'); // le worker reste utilisable
        assert.equal(result.ok, true);
    } finally {
        await worker.terminate();
    }
});
