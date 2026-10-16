// Vérifications statiques d'un niveau (sans exécuter Python) : conformité au schéma, traductions,
// cohérence des tests, règles de contribution. Même esprit que scripts/validate_levels.py, utilisé
// par l'éditeur de niveaux (mode auteur). Chaque problème est un objet { severity, code, path, params } ;
// les textes affichés viennent des catalogues (clé `lint.<code>`), jamais d'ici.

import { Validator } from '../lib/json-schema/index.js';
import { checkDrawing } from './drawingTests.js';
import { ValidationEngine } from './ValidationEngine.js';

const DRAFT = '2020-12';
const PYTHON_TYPES = ['str', 'int', 'float', 'bool', 'list', 'dict', 'tuple', 'set', 'NoneType'];
// Mots-clés qui ne sont que des enveloppes : seuls les « feuilles » donnent un message utile.
const WRAPPER_KEYWORDS = new Set(['properties', 'items', '$ref', 'oneOf', 'anyOf', 'allOf', 'false']);

export class LevelLinter {
    #schema;
    #parts = new Map();
    #top;
    #full;

    /** @param {object} schema  Contenu de levels/schema/level.schema.json. */
    constructor(schema) {
        this.#schema = schema;
        // Niveau sans le détail des étapes et de la mission : on les valide à part, avec des messages ciblés.
        const shallow = structuredClone(schema);
        shallow.properties.steps = { type: 'array' };
        shallow.properties.mission = { type: 'object' };
        this.#top = new Validator(shallow, DRAFT, false);
        // Le validateur annote les sous-schémas qu'il reçoit : chaque instance travaille sur sa propre copie.
        this.#full = new Validator(structuredClone(schema), DRAFT, false);
    }

    /**
     * @param {object} level  Niveau au format du schéma.
     * @param {object} [options]
     * @param {string[]|null} [options.knownLevelIds]  Ids des niveaux existants (vérifie `requires` et l'unicité de l'id).
     * @param {boolean} [options.requireEnglish]
     * @returns {{severity: 'error'|'warning'|'info', code: string, path: (string|number)[], params: object}[]}
     */
    lint(level, { knownLevelIds = null, requireEnglish = true } = {}) {
        const problems = [];
        const add = (severity, code, path = [], params = {}) => problems.push({ severity, code, path, params });

        this.#schemaProblems(level, add);
        if (problems.every((problem) => problem.severity !== 'error')) {
            // Filet de sécurité : le schéma complet fait foi si les contrôles ciblés n'ont rien vu.
            const full = this.#full.validate(level);
            if (!full.valid) {
                add('error', 'schema_invalid', [], { detail: full.errors.find((error) => !WRAPPER_KEYWORDS.has(error.keyword))?.error ?? full.errors[0].error });
            }
        }
        const structurallySound = problems.every((problem) => problem.severity !== 'error');
        if (!structurallySound) {
            // Les règles suivantes supposent une structure correcte (sinon elles produiraient du bruit).
            return problems;
        }
        if (requireEnglish) {
            this.#missingEnglish(level, [], add);
        }
        this.#references(level, knownLevelIds, add);
        this.#contribution(level, add);
        return problems;
    }

    // ---- Schéma -------------------------------------------------------------------------------------------

    #schemaProblems(level, add) {
        if (level === null || typeof level !== 'object' || Array.isArray(level)) {
            add('error', 'schema_type', [], { expected: 'object' });
            return;
        }
        this.#report(this.#top.validate(level), [], add);
        if (!Array.isArray(level.steps)) {
            return;
        }
        level.steps.forEach((step, index) => {
            const type = step?.type;
            const part = type === 'explain' ? 'stepExplain' : type === 'code' ? 'stepCode' : null;
            if (part === null) {
                add('error', 'schema_enum', ['steps', index, 'type'], { allowed: 'explain, code' });
            } else {
                this.#report(this.#part(part).validate(step), ['steps', index], add);
            }
        });
        if (level.mission && typeof level.mission === 'object') {
            this.#report(this.#part('mission').validate(level.mission), ['mission'], add);
        }
    }

    #part(name) {
        if (!this.#parts.has(name)) {
            this.#parts.set(name, new Validator({ $id: this.#schema.$id, $schema: this.#schema.$schema, $defs: structuredClone(this.#schema.$defs), $ref: `#/$defs/${name}` }, DRAFT, false));
        }
        return this.#parts.get(name);
    }

    /** Traduit les erreurs du validateur en problèmes lisibles (feuilles uniquement). */
    #report(result, basePath, add) {
        if (result.valid) {
            return;
        }
        let reported = 0;
        for (const error of result.errors) {
            if (WRAPPER_KEYWORDS.has(error.keyword)) {
                continue;
            }
            const path = [...basePath, ...error.instanceLocation.replace(/^#\/?/, '').split('/').filter(Boolean).map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment))];
            const quoted = /"([^"]+)"/.exec(error.error)?.[1];
            switch (error.keyword) {
                case 'required':
                    add('error', 'schema_required', path, { field: quoted });
                    break;
                case 'additionalProperties':
                    add('error', 'schema_unknown_field', path, { field: quoted });
                    break;
                case 'pattern':
                    add('error', 'schema_pattern', path);
                    break;
                case 'enum':
                case 'const':
                    add('error', 'schema_enum', path);
                    break;
                case 'type':
                    add('error', 'schema_type', path);
                    break;
                case 'minimum':
                case 'maximum':
                case 'minItems':
                    add('error', 'schema_range', path);
                    break;
                default:
                    add('error', 'schema_invalid', path, { detail: error.error });
            }
            reported += 1;
        }
        if (reported === 0) {
            add('error', 'schema_invalid', basePath, { detail: result.errors[0]?.error ?? '' });
        }
    }

    // ---- Traductions --------------------------------------------------------------------------------------

    /** Toute chaîne i18n {fr: …} doit avoir un `en` non vide (règle de contribution du projet). */
    #missingEnglish(node, path, add) {
        if (Array.isArray(node)) {
            node.forEach((child, index) => this.#missingEnglish(child, [...path, index], add));
        } else if (node !== null && typeof node === 'object') {
            if ('fr' in node && (typeof node.fr === 'string' || Array.isArray(node.fr))) {
                const english = node.en;
                const empty = english === undefined || (typeof english === 'string' && english.trim() === '') || (Array.isArray(english) && english.length === 0);
                if (empty) {
                    add('error', 'missing_english', path);
                } else if (Array.isArray(node.fr) && Array.isArray(english) && english.length !== node.fr.length) {
                    add('warning', 'hint_count_differs', path, { fr: node.fr.length, en: english.length });
                }
            }
            for (const [key, child] of Object.entries(node)) {
                this.#missingEnglish(child, [...path, key], add);
            }
        }
    }

    // ---- Références ---------------------------------------------------------------------------------------

    #references(level, knownLevelIds, add) {
        if (knownLevelIds === null) {
            return;
        }
        if (knownLevelIds.includes(level.id)) {
            add('warning', 'id_already_exists', ['id'], { id: level.id });
        }
        (level.requires ?? []).forEach((required, index) => {
            if (required === level.id) {
                add('error', 'requires_self', ['requires', index]);
            } else if (!knownLevelIds.includes(required)) {
                add('error', 'requires_unknown', ['requires', index], { id: required });
            }
        });
    }

    // ---- Règles de contribution et cohérence des tests ----------------------------------------------------

    #contribution(level, add) {
        // Un seul rappel pour toutes les étapes narrées (sinon une ligne par étape noie le reste).
        const narrated = level.steps.map((step, index) => (step.type === 'explain' && step.voice ? index : null)).filter((index) => index !== null);
        if (narrated.length > 0) {
            add('info', 'voice_to_generate', ['steps', narrated[0]], { steps: narrated.map((index) => index + 1).join(', ') });
        }
        level.steps.forEach((step, index) => {
            const path = ['steps', index];
            if (step.type === 'explain') {
                return;
            }
            this.#tests(step.tests, [...path, 'tests'], add);
            if (!step.solution?.trim()) {
                add('error', 'solution_missing', [...path, 'solution']);
            }
            if (!step.hints?.fr?.length) {
                add('warning', 'hints_missing', [...path, 'hints']);
            }
        });
        const { mission } = level;
        if (mission.tests?.length) {
            this.#tests(mission.tests, ['mission', 'tests'], add);
            if (!mission.solution?.trim()) {
                add('error', 'solution_missing', ['mission', 'solution']);
            }
        }
    }

    #tests(tests, path, add) {
        const supported = new Set(ValidationEngine.supportedKinds);
        tests.forEach((test, index) => {
            const here = [...path, index];
            if (!supported.has(test.kind)) {
                add('error', 'kind_unsupported', [...here, 'kind'], { kind: test.kind });
                return;
            }
            if (test.kind.startsWith('var_') && !test.name?.trim()) {
                add('error', 'test_name_missing', [...here, 'name']);
            }
            if (test.kind !== 'no_syntax_error' && test.kind !== 'var_equals' && (typeof test.value !== 'string' || test.value === '')) {
                add('error', 'test_value_missing', [...here, 'value']);
            }
            if (test.kind === 'var_equals' && test.value === undefined) {
                add('error', 'test_value_missing', [...here, 'value']);
            }
            if (test.kind === 'var_type_is' && !PYTHON_TYPES.includes(test.value)) {
                add('warning', 'type_unusual', [...here, 'value'], { allowed: PYTHON_TYPES.join(', ') });
            }
            if (test.kind.startsWith('drawing_') && typeof test.value === 'string' && test.value !== '' && checkDrawing(test, []) === 'invalid_test') {
                add('error', 'drawing_value_invalid', [...here, 'value']);
            }
            if (test.kind === 'stdout_matches_regex' && typeof test.value === 'string') {
                try {
                    new RegExp(test.value);
                } catch (error) {
                    add('error', 'regex_invalid', [...here, 'value'], { detail: error.message });
                }
            }
        });
    }
}
