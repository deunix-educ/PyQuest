// Pour chaque niveau : la solution de référence de chaque étape et de la mission passe tous les tests, et
// le code de départ ne les passe pas. Pyodide réel (vendor/pyodide requis). Utilise LevelChecker, le même
// module que l'éditeur de niveaux ; vérifie aussi qu'il détecte bien des niveaux fautifs fabriqués.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert';
import yaml from '../../app/js/lib/js-yaml/js-yaml.mjs';
import { LevelChecker } from '../../app/js/core/LevelChecker.js';
import { PyodideWorkerClient } from '../../app/js/core/PyodideWorkerClient.js';
import { installNodeWorker } from './helpers/node-worker.mjs';

const root = new URL('../../', import.meta.url).pathname;
const hasPyodide = existsSync(`${root}vendor/pyodide/pyodide.mjs`);
const load = (id) => yaml.load(readFileSync(`${root}levels/${id}/level.yaml`, 'utf8'));
const summary = (problems) => problems.map((problem) => `${problem.code}@${problem.path.join('.')}`);

test('les solutions de référence passent, les codes de départ échouent', { skip: !hasPyodide && 'vendor/pyodide absent', timeout: 300000 }, async () => {
    const { indexURL } = installNodeWorker();
    const client = new PyodideWorkerClient({ indexURL, workerUrl: 'ignored' });
    const checker = new LevelChecker({ client });
    try {
        // --- Tous les niveaux existants.
        let checked = 0;
        for (const id of readdirSync(`${root}levels`).filter((name) => /^\d\d-/.test(name))) {
            const { exercises, problems } = await checker.check(load(id));
            assert.deepEqual(summary(problems), [], `${id}`);
            checked += exercises.length;
        }
        assert.ok(checked > 0);

        // --- Niveaux fautifs fabriqués : chaque défaut est détecté, au bon endroit.
        const base = () => structuredClone(load('04-math'));
        let level = base(); level.steps[1].solution = 'print(1 + 1)';
        assert.deepEqual(summary((await checker.check(level)).problems), ['solution_fails@steps.1']);

        level = base(); level.steps[1].starter = level.steps[1].solution;
        assert.deepEqual(summary((await checker.check(level)).problems), [], 'départ = solution : étape « exécuter pour voir »');

        level = base(); level.steps[1].starter = '# Exécute pour voir\nprice = 12\nquantity = 3\nprint(price * quantity)';
        assert.deepEqual(summary((await checker.check(level)).problems), [], 'départ = solution + commentaires de ligne : idem');

        level = base(); level.steps[1].starter = 'print(36)';
        assert.deepEqual(summary((await checker.check(level)).problems), ['starter_passes@steps.1'], 'départ qui passe déjà sans être la solution');

        level = base(); level.steps[1].solution = 'print(';
        const syntax = (await checker.check(level)).problems;
        assert.deepEqual(summary(syntax), ['solution_error@steps.1']);
        assert.equal(syntax[0].params.type, 'SyntaxError');

        level = base(); level.mission.solution = 'print("rien")';
        assert.deepEqual(summary((await checker.check(level)).problems), ['solution_fails@mission']);

        level = base(); level.steps[1].starter = 'print(';
        assert.deepEqual(summary((await checker.check(level)).problems), ['starter_error@steps.1']);

        console.log(`${checked} exercices vérifiés`);
    } finally {
        client.dispose();
    }
});
