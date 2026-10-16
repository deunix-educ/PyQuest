// Pour chaque niveau : la solution de référence de chaque étape et de la mission doit passer tous
// les tests, et le code de départ ne doit pas les passer (sinon l'exercice serait déjà résolu).
// Pyodide réel (vendor/pyodide requis) ; exécute exactement la logique de l'application
// (StepValidator, ValidationEngine, PyodideWorkerClient).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert';
import yaml from '../../app/js/lib/js-yaml/js-yaml.mjs';
import { PyodideWorkerClient } from '../../app/js/core/PyodideWorkerClient.js';
import { StepValidator } from '../../app/js/core/StepValidator.js';
import { ValidationEngine } from '../../app/js/core/ValidationEngine.js';
import { installNodeWorker } from './helpers/node-worker.mjs';

const root = new URL('../../', import.meta.url).pathname;
// Code sans commentaires ni lignes vides, pour comparer départ et solution.
const bare = (code) =>
    code
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
        .join('\n');
const hasPyodide = existsSync(`${root}vendor/pyodide/pyodide.mjs`);

test('les solutions de référence passent, les codes de départ échouent', { skip: !hasPyodide && 'vendor/pyodide absent', timeout: 300000 }, async () => {
    const { indexURL } = installNodeWorker();
    const client = new PyodideWorkerClient({ indexURL, workerUrl: 'ignored' });
    const stepValidator = new StepValidator({ client, validator: new ValidationEngine() });

    // Comme l'application : exécution « interactive » de l'apprenant, puis validation des tests.
    const attempt = async (code, tests) => {
        // Saisies de l'exécution interactive : celles du premier test scripté, sinon aucune.
        const queue = [...(tests.find((t) => t.inputs)?.inputs ?? [])];
        let stdout = '';
        const result = await client.run(code, {
            collect: ValidationEngine.variablesToCollect(tests),
            onStdout: (text) => (stdout += text),
            onStderr: (text) => (stdout += text),
            onInput: async () => (queue.length > 0 ? queue.shift() : null),
        });
        return stepValidator.validate(code, tests, { stdout, result });
    };
    const failures = (outcome) => outcome.results.filter((r) => !r.passed).map((r) => `${r.kind}:${r.reason}`);

    const problems = [];
    let checked = 0;
    try {
        for (const id of readdirSync(`${root}levels`).filter((name) => /^\d\d-/.test(name))) {
            const level = yaml.load(readFileSync(`${root}levels/${id}/level.yaml`, 'utf8'));
            await client.reset();
            const exercises = [
                ...level.steps.map((step, i) => ({ label: `${id} étape ${i + 1}`, step })).filter(({ step }) => step.type === 'code'),
                ...(level.mission.tests?.length ? [{ label: `${id} mission`, step: { ...level.mission, solution: level.mission.solution } }] : []),
            ];
            for (const { label, step } of exercises) {
                assert.ok(step.solution, `${label} : solution manquante`);
                const solved = await attempt(step.solution, step.tests);
                checked += 1;
                if (!solved.passed) problems.push(`${label} : la solution échoue (${failures(solved)})`);
                // Les étapes « exécuter pour voir » ont un code de départ égal à la solution.
                if (bare(step.starter) !== bare(step.solution)) {
                    const starter = await attempt(step.starter, step.tests);
                    if (starter.passed) problems.push(`${label} : le code de départ passe déjà les tests`);
                }
            }
        }
    } finally {
        client.dispose();
    }
    assert.deepEqual(problems, []);
    assert.ok(checked > 0);
    console.log(`${checked} exercices vérifiés`);
});
