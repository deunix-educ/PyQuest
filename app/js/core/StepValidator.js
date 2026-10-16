// Valide le code d'une étape ou d'une mission contre ses tests déclaratifs.
// Les tests sans `inputs` portent sur l'exécution de l'apprenant ; ceux qui déclarent `inputs`
// sont évalués sur un rejeu isolé du code, avec ces saisies scriptées (validation déterministe).

import { ValidationEngine } from './ValidationEngine.js';

export class StepValidator {
    #client;
    #validator;

    /**
     * @param {object} deps
     * @param {import('./PyodideWorkerClient.js').PyodideWorkerClient} deps.client
     * @param {ValidationEngine} deps.validator
     */
    constructor({ client, validator }) {
        this.#client = client;
        this.#validator = validator;
    }

    /**
     * @param {string} code  Code de l'apprenant.
     * @param {object[]} tests
     * @param {{stdout: string, result: object}} interactive  Exécution déjà faite par l'apprenant.
     * @returns {Promise<{passed: boolean, results: object[]}>}
     */
    async validate(code, tests, interactive) {
        const groups = new Map();
        tests.forEach((test, index) => {
            const key = JSON.stringify(test.inputs ?? null);
            groups.set(key, [...(groups.get(key) ?? []), { test, index }]);
        });

        const results = new Array(tests.length);
        for (const [key, members] of groups) {
            const inputs = JSON.parse(key);
            const groupTests = members.map((member) => member.test);
            const execution =
                inputs === null ? interactive : await this.#replay(code, inputs, ValidationEngine.variablesToCollect(groupTests));
            const { results: partial } = this.#validator.validate(groupTests, { ...execution, code });
            partial.forEach((entry, i) => (results[members[i].index] = entry));
        }
        const passed = interactive.result.ok && results.every((entry) => entry.passed);
        return { passed, results };
    }

    /** Rejoue le code sur une copie de l'état, en répondant aux input() avec `inputs`. */
    async #replay(code, inputs, collect) {
        let stdout = '';
        const queue = [...inputs];
        const result = await this.#client.run(code, {
            collect,
            isolated: true,
            onStdout: (text) => (stdout += text),
            onStderr: (text) => (stdout += text),
            onInput: async () => (queue.length > 0 ? queue.shift() : null),
        });
        return { stdout, result };
    }
}
