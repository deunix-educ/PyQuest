// Éditeur d'un test déclaratif (un `tests[]` du niveau) : kind, champs adaptés au kind, saisies scriptées, message.

import { el } from '../ui/dom.js';
import { PYTHON_TYPES, TEST_KINDS } from './LevelDraft.js';
import { i18nPair, selectField, textField } from './fields.js';

/**
 * @param {object} options
 * @param {(key: string, params?: object) => string} options.t
 * @param {object} options.test  Modèle du test (modifié en place).
 * @param {string} options.path  Chemin du test, ex. 'steps.1.tests.0'.
 * @param {number} options.number  Numéro affiché (à partir de 1).
 * @param {() => void} options.onChange  Un champ a changé.
 * @param {() => void} options.onStructure  La forme du formulaire change (re-rendu nécessaire).
 * @param {() => void} options.onRemove
 */
export function testEditor({ t, test, path, number, onChange, onStructure, onRemove }) {
    const spec = TEST_KINDS[test.kind];
    const fields = [
        selectField({
            label: t('author.test.kind'),
            path: `${path}.kind`,
            value: test.kind,
            options: Object.keys(TEST_KINDS).map((kind) => [kind, t(`author.kind.${kind}`)]),
            help: t(`author.kind.${test.kind}.help`),
            onChange: (kind) => {
                test.kind = kind;
                onChange();
                onStructure();
            },
        }),
    ];
    if (spec.name) {
        fields.push(textField({ label: t('author.test.name'), path: `${path}.name`, value: test.name, code: true, onInput: (value) => ((test.name = value), onChange()) }));
    }
    if (spec.value === 'text') {
        fields.push(
            textField({
                label: t('author.test.value'),
                path: `${path}.value`,
                value: test.value,
                multiline: true,
                rows: 2,
                code: true,
                help: test.kind === 'stdout_equals' ? t('author.test.value.newline') : test.kind === 'stdout_matches_regex' ? t('author.test.value.regex') : null,
                onInput: (value) => ((test.value = value), onChange()),
            }),
        );
    } else if (spec.value === 'typed') {
        fields.push(
            textField({ label: t('author.test.value'), path: `${path}.value`, value: test.value, code: true, onInput: (value) => ((test.value = value), onChange()) }),
            selectField({
                label: t('author.test.valueType'),
                path: `${path}.valueType`,
                value: test.valueType,
                options: [['text', t('author.valueType.text')], ['number', t('author.valueType.number')], ['boolean', t('author.valueType.boolean')]],
                help: t('author.test.valueType.help'),
                onChange: (valueType) => ((test.valueType = valueType), onChange()),
            }),
        );
    } else if (spec.value === 'type') {
        fields.push(
            selectField({
                label: t('author.test.type'),
                path: `${path}.value`,
                value: PYTHON_TYPES.includes(test.value) ? test.value : '',
                options: [['', '—'], ...PYTHON_TYPES.map((type) => [type, type])],
                onChange: (value) => ((test.value = value), onChange()),
            }),
        );
    }
    fields.push(
        textField({ label: t('author.test.inputs'), path: `${path}.inputs`, value: test.inputs, multiline: true, rows: 2, code: true, help: t('author.test.inputs.help'), onInput: (value) => ((test.inputs = value), onChange()) }),
        el('details', { class: 'test-message' }, el('summary', { text: t('author.test.message') }), i18nPair({ label: t('author.test.message.label'), path: `${path}.message`, value: test.message, onChange })),
    );
    return el(
        'fieldset',
        { class: 'test-editor' },
        el('legend', { text: t('author.test.title', { n: number }) }),
        ...fields,
        el('button', { type: 'button', class: 'btn', 'aria-label': t('author.test.remove', { n: number }), text: t('author.remove'), onclick: onRemove }),
    );
}
