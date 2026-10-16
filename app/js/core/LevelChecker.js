// Vérifications d'exécution d'un niveau, avec le vrai moteur Python : la solution de chaque étape de
// code (et de la mission) doit passer ses tests, et le code de départ ne doit PAS les passer (sinon
// l'exercice serait déjà résolu), sauf pour les étapes « exécute pour voir » (départ = solution à des
// commentaires près). Même logique que l'application (StepValidator, ValidationEngine). Utilisé par
// `make test` et par l'éditeur de niveaux. Même forme de problèmes que LevelLinter.

import { StepValidator } from './StepValidator.js';
import { ValidationEngine } from './ValidationEngine.js';

/** Code sans commentaires ni lignes vides, pour comparer départ et solution. */
export function bare(code) {
    return code
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
        .join('\n');
}

export class LevelChecker {
    #client;
    #stepValidator;

    /**
     * @param {object} deps
     * @param {import('./PyodideWorkerClient.js').PyodideWorkerClient} deps.client
     * @param {ValidationEngine} [deps.validator]
     */
    constructor({ client, validator = new ValidationEngine() }) {
        this.#client = client;
        this.#stepValidator = new StepValidator({ client, validator });
    }

    /**
     * @param {object} level  Niveau (déjà valide structurellement).
     * @param {object} [options]
     * @param {(done: number, total: number) => void} [options.onProgress]
     * @returns {Promise<{exercises: {path: (string|number)[], runOnly: boolean, solutionPassed: boolean|null}[], problems: object[]}>}
     */
    async check(level, { onProgress = () => {} } = {}) {
        await this.#client.reset();
        const exercises = [
            ...level.steps.map((step, index) => ({ path: ['steps', index], exercise: step })).filter(({ exercise }) => exercise.type === 'code'),
            ...(level.mission?.tests?.length ? [{ path: ['mission'], exercise: level.mission }] : []),
        ];
        const problems = [];
        const summary = [];
        let done = 0;
        for (const { path, exercise } of exercises) {
            const add = (severity, code, params = {}) => problems.push({ severity, code, path, params });
            const entry = { path, runOnly: false, solutionPassed: null };
            summary.push(entry);
            onProgress(done, exercises.length);
            if (!exercise.solution?.trim()) {
                // Déjà signalé par LevelLinter ; rien à exécuter.
                done += 1;
                continue;
            }
            const solved = await this.#attempt(exercise.solution, exercise.tests);
            entry.solutionPassed = solved.passed;
            if (solved.error) {
                add('error', 'solution_error', { type: solved.error.type, message: solved.error.message, line: solved.error.lineno });
            } else if (!solved.passed) {
                add('error', 'solution_fails', { failures: solved.failures });
            }
            entry.runOnly = bare(exercise.starter ?? '') === bare(exercise.solution);
            if (!entry.runOnly && exercise.starter?.trim()) {
                const started = await this.#attempt(exercise.starter, exercise.tests);
                if (started.error?.type === 'SyntaxError') {
                    add('error', 'starter_error', { type: started.error.type, message: started.error.message, line: started.error.lineno });
                } else if (started.passed) {
                    add('error', 'starter_passes');
                }
            }
            done += 1;
        }
        onProgress(done, exercises.length);
        return { exercises: summary, problems };
    }

    /** Exécute `code` comme l'apprenant (saisies du premier test scripté), puis valide ses tests. */
    async #attempt(code, tests) {
        const queue = [...(tests.find((test) => test.inputs)?.inputs ?? [])];
        let stdout = '';
        const result = await this.#client.run(code, {
            collect: ValidationEngine.variablesToCollect(tests),
            onStdout: (text) => (stdout += text),
            onStderr: (text) => (stdout += text),
            onInput: async () => (queue.length > 0 ? queue.shift() : null),
        });
        const outcome = await this.#stepValidator.validate(code, tests, { stdout, result });
        return {
            passed: outcome.passed,
            error: result.error,
            failures: outcome.results.filter((entry) => !entry.passed).map((entry) => ({ kind: entry.kind, reason: entry.reason })),
        };
    }
}
