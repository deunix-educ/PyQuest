// Interprète les tests déclaratifs d'un niveau (enum fermé `tests[].kind`).
// Agnostique du contenu : aucun code venant d'un fichier de niveau n'est exécuté ici.

const FLOAT_TOLERANCE = 1e-9;

export class ValidationEngine {
    /** Kinds de test interprétés par le moteur (le schéma en autorise davantage : certains sont encore à définir). */
    static get supportedKinds() {
        return ['no_syntax_error', 'stdout_equals', 'stdout_contains', 'stdout_matches_regex', 'code_contains', 'var_equals', 'var_type_is'];
    }

    /** Noms de variables à relire côté Python (option `collect` de run_code) pour ces tests. */
    static variablesToCollect(tests) {
        const names = tests.filter((test) => test.kind.startsWith('var_')).map((test) => test.name);
        return [...new Set(names)];
    }

    /**
     * @param {object[]} tests  Tests du niveau (kind, value, name, message).
     * @param {object} execution
     * @param {string} execution.stdout  Sortie standard cumulée de la cellule.
     * @param {string} [execution.code]  Code exécuté (pour `code_contains`).
     * @param {{ok: boolean, error: object|null, variables: object}} execution.result
     * @returns {{passed: boolean, results: {kind: string, passed: boolean, reason: string|null, message: string|null}[]}}
     */
    validate(tests, { stdout, result, code = '' }) {
        const results = tests.map((test) => {
            const reason = this.#check(test, stdout, result, code);
            return { kind: test.kind, passed: reason === null, reason, message: test.message ?? null };
        });
        // Une erreur d'exécution fait toujours échouer l'étape, même si les tests passent.
        const passed = result.ok && results.every((entry) => entry.passed);
        return { passed, results };
    }

    /** Renvoie null si le test passe, sinon un code de raison (traduit par l'UI). */
    #check(test, stdout, result, code) {
        switch (test.kind) {
            case 'no_syntax_error':
                return result.error?.type === 'SyntaxError' ? 'syntax_error' : null;
            case 'stdout_equals':
                return stdout === test.value ? null : 'stdout_mismatch';
            case 'stdout_contains':
                return stdout.includes(test.value) ? null : 'stdout_missing';
            case 'code_contains':
                return code.includes(test.value) ? null : 'code_missing';
            case 'stdout_matches_regex':
                return this.#matchesRegex(test.value, stdout);
            case 'var_equals':
                return this.#varEquals(test, result.variables);
            case 'var_type_is':
                return this.#varTypeIs(test, result.variables);
            default:
                // Kind connu du schéma mais pas encore interprété (ou inconnu).
                return 'unsupported_kind';
        }
    }

    #matchesRegex(pattern, stdout) {
        try {
            return new RegExp(pattern).test(stdout) ? null : 'stdout_mismatch';
        } catch {
            return 'invalid_regex';
        }
    }

    #varEquals({ name, value }, variables) {
        const variable = variables[name];
        if (!variable) {
            return 'variable_missing';
        }
        // JSON ne distingue pas 10 de 10.0 : le type se vérifie avec var_type_is.
        const actual = variable.value;
        if (typeof actual === 'number' && typeof value === 'number') {
            return Math.abs(actual - value) <= FLOAT_TOLERANCE ? null : 'value_mismatch';
        }
        return actual === value ? null : 'value_mismatch';
    }

    #varTypeIs({ name, value }, variables) {
        const variable = variables[name];
        if (!variable) {
            return 'variable_missing';
        }
        return variable.type === value ? null : 'type_mismatch';
    }
}
