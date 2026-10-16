// Bulle du personnage-guide : avatar (chouette) + message. Décoratif pour les lecteurs d'écran
// (l'avatar est masqué) ; le texte reste lisible dans l'ordre de lecture.

import { el } from './dom.js';
import { createOwl } from './guideArt.js';

export class GuideBubble {
    #root;

    /** @param {{text: string, mood: string}} message  Issu de GuideEngine.say(). */
    constructor({ text, mood }) {
        this.#root = el(
            'div',
            { class: 'guide-bubble', 'data-mood': mood },
            el('div', { class: 'guide-avatar', 'aria-hidden': 'true' }, createOwl()),
            el('p', { class: 'guide-text', text }),
        );
    }

    get element() {
        return this.#root;
    }
}
