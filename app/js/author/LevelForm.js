// Formulaire complet d'un niveau : informations, étapes, mission. Modifie le modèle en place et signale
// les changements ; se reconstruit entièrement quand la structure change (ajout, suppression, déplacement).

import { el } from '../ui/dom.js';
import { REWARD_SOUNDS, newStepModel } from './LevelDraft.js';
import { checkboxField, i18nPair, numberField, selectField, textField } from './fields.js';
import { stepEditor, testsEditor } from './StepEditor.js';

export class LevelForm {
    #t;
    #model;
    #root;
    #knownIds;
    #onChange;

    /**
     * @param {object} options
     * @param {(key: string, params?: object) => string} options.t
     * @param {object} options.model  Modèle de formulaire (voir LevelDraft).
     * @param {string[]} options.knownIds  Ids des niveaux existants (pour `requires`).
     * @param {() => void} options.onChange
     */
    constructor({ t, model, knownIds, onChange }) {
        this.#t = t;
        this.#model = model;
        this.#knownIds = knownIds;
        this.#onChange = onChange;
        this.#root = el('div', { class: 'level-form' });
        this.render();
    }

    get element() {
        return this.#root;
    }

    /** Remplace le modèle (chargement d'un niveau, nouveau niveau) et reconstruit le formulaire. */
    setModel(model) {
        this.#model = model;
        this.render();
    }

    /** Donne le focus au champ d'un chemin (ex. 'steps.2.solution'), avec repli sur les variantes .fr/.en. */
    focusPath(path) {
        const dotted = path.join ? path.join('.') : path;
        for (const candidate of [dotted, `${dotted}.fr`, `${dotted}.en`, `${dotted}.kind`]) {
            const target = this.#root.querySelector(`[data-path="${candidate}"]`);
            if (target) {
                target.scrollIntoView?.({ block: 'center' });
                target.focus();
                return true;
            }
        }
        return false;
    }

    render(focusPath = null) {
        const t = this.#t;
        const model = this.#model;
        const changed = () => this.#onChange();
        const restructure = (focus) => {
            this.render(focus ?? null);
            changed();
        };

        const info = el(
            'section',
            { class: 'form-section', 'aria-labelledby': 'section-info' },
            el('h2', { id: 'section-info', text: t('author.section.info') }),
            textField({ label: t('author.level.id'), path: 'id', value: model.id, code: true, help: t('author.level.id.help'), onInput: (value) => ((model.id = value), changed()) }),
            i18nPair({ label: t('author.level.title'), path: 'title', value: model.title, onChange: changed }),
            el(
                'div',
                { class: 'field-row' },
                numberField({ label: t('author.level.difficulty'), path: 'difficulty', value: model.difficulty, min: 0, max: 10, help: t('author.level.difficulty.help'), onInput: (value) => ((model.difficulty = value), changed()) }),
                numberField({ label: t('author.level.xp'), path: 'xp', value: model.xp, min: 0, help: t('author.level.xp.help'), onInput: (value) => ((model.xp = value), changed()) }),
            ),
            this.#requires(),
        );

        const steps = el(
            'section',
            { class: 'form-section', 'aria-labelledby': 'section-steps' },
            el('h2', { id: 'section-steps', text: t('author.section.steps') }),
            el('p', { class: 'field-help', text: t('author.section.steps.help') }),
            ...model.steps.map((step, index) =>
                stepEditor({
                    t,
                    step,
                    index,
                    count: model.steps.length,
                    onChange: changed,
                    onStructure: restructure,
                    actions: {
                        move: (delta) => {
                            const target = index + delta;
                            [model.steps[index], model.steps[target]] = [model.steps[target], model.steps[index]];
                            restructure(`steps.${target}.${delta < 0 ? 'up' : 'down'}`);
                        },
                        remove: () => {
                            model.steps.splice(index, 1);
                            restructure('steps.add');
                        },
                    },
                }),
            ),
            el(
                'div',
                { class: 'step-add' },
                el('button', { type: 'button', class: 'btn', 'data-path': 'steps.add', text: t('author.step.add.explain'), onclick: () => (model.steps.push(newStepModel('explain')), restructure(`steps.${model.steps.length - 1}.text`)) }),
                el('button', { type: 'button', class: 'btn', text: t('author.step.add.code'), onclick: () => (model.steps.push(newStepModel('code')), restructure(`steps.${model.steps.length - 1}.instruction`)) }),
            ),
        );

        const { mission } = model;
        const missionSection = el(
            'section',
            { class: 'form-section', 'aria-labelledby': 'section-mission' },
            el('h2', { id: 'section-mission', text: t('author.section.mission') }),
            i18nPair({ label: t('author.mission.title'), path: 'mission.title', value: mission.title, onChange: changed }),
            i18nPair({ label: t('author.mission.goal'), path: 'mission.goal', value: mission.goal, multiline: true, rows: 3, onChange: changed }),
            textField({ label: t('author.step.starter'), path: 'mission.starter', value: mission.starter, multiline: true, rows: 5, code: true, onInput: (value) => ((mission.starter = value), changed()) }),
            el('h4', { text: t('author.tests') }),
            el('p', { class: 'field-help', text: t('author.mission.tests.help') }),
            testsEditor({ t, tests: mission.tests, path: 'mission.tests', onChange: changed, onStructure: restructure, addLabel: t('author.test.add') }),
            textField({ label: t('author.step.solution'), path: 'mission.solution', value: mission.solution, multiline: true, rows: 6, code: true, help: t('author.step.solution.help'), onInput: (value) => ((mission.solution = value), changed()) }),
            selectField({
                label: t('author.mission.reward'),
                path: 'mission.rewardSound',
                value: mission.rewardSound,
                options: [['', '—'], ...REWARD_SOUNDS.map((sound) => [sound, sound])],
                onChange: (value) => ((mission.rewardSound = value), changed()),
            }),
        );

        this.#root.replaceChildren(info, steps, missionSection);
        if (focusPath) {
            this.focusPath(focusPath);
        }
    }

    #requires() {
        const t = this.#t;
        const model = this.#model;
        // Un prérequis est un niveau antérieur : si l'id est valide, on ne propose que les ids plus petits.
        const ordered = /^\d\d-/.test(model.id);
        const others = this.#knownIds.filter((id) => id !== model.id && (!ordered || id < model.id));
        return el(
            'fieldset',
            { class: 'requires' },
            el('legend', { text: t('author.level.requires') }),
            el('p', { class: 'field-help', text: t('author.level.requires.help') }),
            ...(others.length === 0
                ? [el('p', { text: t('author.level.requires.none') })]
                : others.map((id) =>
                      checkboxField({
                          label: id,
                          path: `requires.${id}`,
                          checked: model.requires.includes(id),
                          onChange: (checked) => {
                              model.requires = checked ? [...model.requires, id] : model.requires.filter((other) => other !== id);
                              this.#onChange();
                          },
                      }),
                  )),
        );
    }
}
