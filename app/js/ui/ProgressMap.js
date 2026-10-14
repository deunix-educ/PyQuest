// Carte de progression : liste des niveaux avec leur état, en texte (pas seulement en couleur).
// Émet 'select' (detail: { id }). Aucun verrou : tous les niveaux restent accessibles.

import { el } from './dom.js';

export class ProgressMap extends EventTarget {
    #i18n;
    #root;

    constructor(i18n) {
        super();
        this.#i18n = i18n;
        this.#root = el('nav', { class: 'progress-map', 'aria-label': i18n.t('progress.title') });
    }

    get element() {
        return this.#root;
    }

    /**
     * @param {object} data
     * @param {{id: string, title: string}[]} data.levels  Titres déjà localisés, dans l'ordre.
     * @param {{completedLevels: object, xp: number, streak: {current: number}}} data.progress  Snapshot du ProgressStore.
     * @param {string|null} data.currentId
     */
    render({ levels, progress, currentId }) {
        const items = levels.map(({ id, title }) => {
            const done = id in progress.completedLevels;
            const current = id === currentId;
            const stateKey = done ? 'progress.done' : current ? 'progress.current' : 'progress.todo';
            const button = el(
                'button',
                {
                    type: 'button',
                    class: `level-button${done ? ' is-done' : ''}${current ? ' is-current' : ''}`,
                    'aria-current': current ? 'step' : null,
                    onclick: () => this.dispatchEvent(new CustomEvent('select', { detail: { id } })),
                },
                el('span', { class: 'level-title', text: title }),
                el('span', { class: 'level-state', text: this.#i18n.t(stateKey) }),
            );
            return el('li', {}, button);
        });
        this.#root.replaceChildren(
            el('h2', { text: this.#i18n.t('progress.title') }),
            el('p', { class: 'progress-summary', text: `${this.#i18n.t('progress.xp', { xp: progress.xp })} · ${this.#i18n.t('progress.streak', { days: progress.streak.current })}` }),
            el('ol', { class: 'level-list' }, ...items),
        );
    }
}
