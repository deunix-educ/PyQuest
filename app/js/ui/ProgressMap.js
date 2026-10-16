// Carte de progression : un chemin sinueux de niveaux (pastilles reliées), avec la chouette sur le niveau en cours.
// Chaque niveau est un vrai bouton (clavier) dont le nom contient le numéro, le titre et l'état en texte :
// la forme (✔ / numéro) et le texte portent le sens, jamais la couleur seule.
// Émet 'select' (detail: { id }). Aucun verrou : tous les niveaux restent accessibles.

import { el, svg } from './dom.js';
import { createOwl } from './guideArt.js';

// Abscisses (en % de la largeur) des pastilles, répétées : le chemin serpente.
const X_PATTERN = [24, 50, 76, 50];
const ROW_REM = 8; // hauteur d'une rangée, en rem (suit la taille de texte choisie)

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

    /** Fait défiler le tiroir jusqu'au niveau en cours (à appeler à l'ouverture). */
    scrollToCurrent() {
        this.#root.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
    }

    /**
     * @param {object} data
     * @param {{id: string, title: string}[]} data.levels  Titres déjà localisés, dans l'ordre.
     * @param {{completedLevels: object, xp: number, streak: {current: number}}} data.progress  Snapshot du ProgressStore.
     * @param {string|null} data.currentId
     */
    render({ levels, progress, currentId }) {
        const count = levels.length;
        const doneAt = levels.map(({ id }) => id in progress.completedLevels);
        const doneCount = doneAt.filter(Boolean).length;
        const summary = this.#i18n.t('progress.levels_done', { done: doneCount, total: count });
        const xAt = (index) => X_PATTERN[index % X_PATTERN.length];

        this.#root.replaceChildren(
            el('p', { class: 'progress-count', id: 'progress-count', text: summary }),
            el('progress', { class: 'progress-bar', max: count, value: doneCount, 'aria-labelledby': 'progress-count' }),
            el('p', { class: 'progress-summary', text: `${this.#i18n.t('progress.xp', { xp: progress.xp })} · ${this.#i18n.t('progress.streak', { days: progress.streak.current })}` }),
            el(
                'div',
                { class: 'level-map', style: `height: ${count * ROW_REM}rem` },
                this.#path(count, doneAt, xAt),
                el('ol', { class: 'level-map-list' }, ...levels.map(({ id, title }, index) => this.#node({ id, title, index, count, x: xAt(index), done: doneAt[index], current: id === currentId }))),
            ),
        );
    }

    /** Chemin décoratif : une courbe par segment, pleine si le niveau d'où elle part est terminé. */
    #path(count, doneAt, xAt) {
        const rowHeight = 100;
        const segments = [];
        for (let i = 0; i < count - 1; i++) {
            const [x0, y0, x1, y1] = [xAt(i), (i + 0.5) * rowHeight, xAt(i + 1), (i + 1.5) * rowHeight];
            const middle = (y0 + y1) / 2;
            segments.push(`<path class="map-segment ${doneAt[i] ? 'is-done' : ''}" d="M${x0} ${y0} C${x0} ${middle} ${x1} ${middle} ${x1} ${y1}"/>`);
        }
        return svg(`<svg xmlns="http://www.w3.org/2000/svg" class="level-map-path" viewBox="0 0 100 ${count * rowHeight}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${segments.join('')}</svg>`);
    }

    #node({ id, title, index, count, x, done, current }) {
        const t = (key, params) => this.#i18n.t(key, params);
        const stateKey = done ? 'progress.done' : current ? 'progress.current' : 'progress.todo';
        const state = `${done ? ' is-done' : ''}${current ? ' is-current' : ''}`;
        const button = el(
            'button',
            {
                type: 'button',
                class: `level-button${state}`,
                'aria-current': current ? 'step' : null,
                onclick: () => this.dispatchEvent(new CustomEvent('select', { detail: { id } })),
            },
            el('span', { class: 'sr-only', text: `${t('map.level_label', { n: index + 1 })} : ` }),
            el('span', { class: 'node-badge', 'aria-hidden': 'true', text: done ? '✔' : String(index + 1) }),
            el('span', { class: 'level-title', text: title }),
            el('span', { class: 'level-state', text: t(stateKey) }),
        );
        const marker = current ? el('span', { class: 'map-owl', 'data-mood': 'happy', 'aria-hidden': 'true' }, createOwl()) : null;
        return el('li', { class: 'map-item', style: `left: ${x}%; top: ${((index + 0.5) / count) * 100}%` }, button, marker);
    }
}
