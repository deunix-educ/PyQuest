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
    const inputBuffer = new SharedArrayBuffer(8 + 4096);
    const control = new Int32Array(inputBuffer, 0, 2);
    const prompts = [];
    let inputAnswer = 'Léa'; // null = fin de saisie ; undefined = ne pas répondre
    const answerInput = () => {
        if (inputAnswer === undefined) return;
        const length = inputAnswer === null ? 0 : new TextEncoder().encodeInto(inputAnswer, new Uint8Array(inputBuffer, 8)).written;
        Atomics.store(control, 1, length);
        Atomics.store(control, 0, inputAnswer === null ? 2 : 1);
        Atomics.notify(control, 0);
    };
    const waiters = new Map();
    const stdout = [];
    worker.on('message', (message) => {
        if (message.type === 'stdout') stdout.push(message.text);
        if (message.type === 'input_request') {
            prompts.push(message.prompt);
            answerInput();
        }
        const key = message.type === 'result' ? message.id : 'init';
        if (['result', 'ready', 'init_error'].includes(message.type)) waiters.get(key)?.(message);
    });
    worker.on('error', (error) => {
        throw error;
    });
    const wait = (key) => new Promise((resolve) => waiters.set(key, resolve));
    const run = (id, code, collect = [], isolated = false) => {
        const done = wait(id);
        worker.postMessage({ type: 'run_code', id, code, collect, isolated });
        return done;
    };

    try {
        const init = wait('init');
        worker.postMessage({ type: 'init', indexURL, interruptBuffer, inputBuffer });
        assert.deepEqual(await init, { type: 'ready', interruptible: true });

        let result = await run(1, 'x = 10.0\nprint("hé")\nprint(x)', ['x']);
        assert.equal(result.ok, true);
        assert.deepEqual(stdout.join(''), 'hé\n10.0\n');
        assert.deepEqual(result.variables.x, { type: 'float', repr: '10.0', value: 10 });

        result = await run(2, 'print(nom)');
        assert.deepEqual([result.error.type, result.error.lineno], ['NameError', 1]);

        result = await run(3, 'y = x + 1', ['y']); // l'espace de noms persiste
        assert.equal(result.variables.y.value, 11);

        // input() : réponse de l'apprenant, y compris caractères non ASCII.
        result = await run(4, 'who = input("Nom ? ")\nprint("Salut " + who)', ['who']);
        assert.equal(result.ok, true);
        assert.equal(result.variables.who.value, 'Léa');
        assert.deepEqual(prompts, ['Nom ? ']);
        assert.ok(stdout.join('').includes('Nom ? Salut Léa\n'), 'invite et sortie dans stdout');

        // Fin de saisie : EOFError.
        inputAnswer = null;
        result = await run(7, 'input()');
        assert.equal(result.error.type, 'EOFError');

        // Interruption pendant l'attente d'une saisie : KeyboardInterrupt, pas EOFError.
        inputAnswer = undefined;
        const waiting = run(8, 'input("?")');
        setTimeout(() => (new Uint8Array(interruptBuffer)[0] = 2), 400);
        assert.equal((await waiting).error.type, 'KeyboardInterrupt');
        inputAnswer = 'x';

        // Exécution isolée : l'espace de noms de l'apprenant n'est pas modifié.
        await run(9, 'counter = 1');
        result = await run(10, 'counter = 99', ['counter'], true);
        assert.equal(result.variables.counter.value, 99);
        result = await run(11, 'pass', ['counter']);
        assert.equal(result.variables.counter.value, 1);

        const looping = run(5, 'while True:\n    pass');
        setTimeout(() => (new Uint8Array(interruptBuffer)[0] = 2), 500);
        assert.equal((await looping).error.type, 'KeyboardInterrupt');

        result = await run(6, 'print("après")'); // le worker reste utilisable
        assert.equal(result.ok, true);
    } finally {
        await worker.terminate();
    }
});
