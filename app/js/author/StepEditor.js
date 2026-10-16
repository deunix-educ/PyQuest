// Éditeur d'une étape (explication ou exercice de code) et de sa liste de tests.

import { el } from '../ui/dom.js';
import { newTestModel } from './LevelDraft.js';
import { checkboxField, i18nPair, textField } from './fields.js';
import { testEditor } from './TestEditor.js';

/** Liste de tests éditables, avec bouton d'ajout. Partagée par les exercices et la mission. */
export function testsEditor({ t, tests, path, onChange, onStructure, addLabel }) {
    return el(
        'div',
        { class: 'tests-editor' },
        ...tests.map((test, index) =>
            testEditor({
                t,
                test,
                path: `${path}.${index}`,
                number: index + 1,
                onChange,
                onStructure,
                onRemove: () => {
                    tests.splice(index, 1);
                    onChange();
                    onStructure(`${path}.add`);
                },
            }),
        ),
        el('button', {
            type: 'button',
            class: 'btn',
            'data-path': `${path}.add`,
            text: addLabel,
            onclick: () => {
                tests.push(newTestModel());
                onChange();
                onStructure(`${path}.${tests.length - 1}.kind`);
            },
        }),
    );
}

/**
 * @param {object} options
 * @param {(key: string, params?: object) => string} options.t
 * @param {object} options.step  Modèle de l'étape (modifié en place).
 * @param {number} options.index  Position (à partir de 0).
 * @param {number} options.count  Nombre d'étapes.
 * @param {() => void} options.onChange
 * @param {(focusPath?: string) => void} options.onStructure
 * @param {{move: (delta: number) => void, remove: () => void}} options.actions
 */
export function stepEditor({ t, step, index, count, onChange, onStructure, actions }) {
    const path = `steps.${index}`;
    const number = index + 1;
    const body =
        step.type === 'explain'
            ? [
                  i18nPair({ label: t('author.step.text'), path: `${path}.text`, value: step.text, multiline: true, rows: 4, help: t('author.step.text.help'), onChange }),
                  checkboxField({ label: t('author.step.voice'), path: `${path}.voice`, checked: step.voice, help: t('author.step.voice.help'), onChange: (checked) => ((step.voice = checked), onChange()) }),
                  textField({ label: t('author.step.image'), path: `${path}.image`, value: step.image, help: t('author.step.image.help'), onInput: (value) => ((step.image = value), onChange()) }),
              ]
            : [
                  i18nPair({ label: t('author.step.instruction'), path: `${path}.instruction`, value: step.instruction, multiline: true, rows: 2, onChange }),
                  textField({ label: t('author.step.starter'), path: `${path}.starter`, value: step.starter, multiline: true, rows: 6, code: true, help: t('author.step.starter.help'), onInput: (value) => ((step.starter = value), onChange()) }),
                  el('h4', { text: t('author.tests') }),
                  testsEditor({ t, tests: step.tests, path: `${path}.tests`, onChange, onStructure, addLabel: t('author.test.add') }),
                  i18nPair({ label: t('author.step.hints'), path: `${path}.hints`, value: step.hints, multiline: true, rows: 3, help: t('author.step.hints.help'), onChange }),
                  textField({ label: t('author.step.solution'), path: `${path}.solution`, value: step.solution, multiline: true, rows: 6, code: true, help: t('author.step.solution.help'), onInput: (value) => ((step.solution = value), onChange()) }),
              ];
    return el(
        'section',
        { class: 'step-editor', 'aria-labelledby': `${path}-title` },
        el(
            'div',
            { class: 'step-header' },
            el('h3', { id: `${path}-title`, text: t('author.step.title', { n: number, type: t(`author.step.type.${step.type}`) }) }),
            el(
                'div',
                { class: 'step-actions' },
                el('button', { type: 'button', class: 'btn', 'data-path': `${path}.up`, disabled: index === 0, 'aria-label': t('author.step.up', { n: number }), text: '↑', onclick: () => actions.move(-1) }),
                el('button', { type: 'button', class: 'btn', 'data-path': `${path}.down`, disabled: index === count - 1, 'aria-label': t('author.step.down', { n: number }), text: '↓', onclick: () => actions.move(1) }),
                el('button', { type: 'button', class: 'btn', 'aria-label': t('author.step.remove', { n: number }), text: t('author.remove'), onclick: actions.remove }),
            ),
        ),
        ...body,
    );
}
