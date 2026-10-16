// Indices graduels : un seul nouvel indice par clic, jamais tous à la fois.

import { el, renderInline } from './dom.js';

export class HintPanel {
    #i18n;
    #hints;
    #onReveal;
    #revealed = 0;
    #button;
    #list;
    #root;

    /** @param {string[]} hints  Indices déjà localisés, du plus vague au plus précis.
     *  @param {{onReveal?: () => void}} [options]  Rappel à chaque indice révélé. */
    constructor(i18n, hints, { onReveal = () => {} } = {}) {
        this.#i18n = i18n;
        this.#onReveal = onReveal;
        this.#hints = hints;
        this.#button = el('button', { type: 'button', class: 'btn', onclick: () => this.reveal() });
        this.#list = el('ol', { class: 'hint-list', 'aria-live': 'polite' });
        this.#root = el('div', { class: 'hint-panel', hidden: hints.length === 0 }, this.#button, this.#list);
        this.#refresh();
    }

    get element() {
        return this.#root;
    }

    /** Reste-t-il au moins un indice à révéler ? */
    get hasMore() {
        return this.#revealed < this.#hints.length;
    }

    /** Affiche l'indice suivant. Renvoie false s'il n'en reste plus. */
    reveal() {
        if (this.#revealed >= this.#hints.length) {
            return false;
        }
        this.#list.append(el('li', {}, renderInline(this.#hints[this.#revealed])));
        this.#revealed += 1;
        this.#refresh();
        this.#onReveal();
        return true;
    }

    #refresh() {
        const remaining = this.#revealed < this.#hints.length;
        this.#button.disabled = !remaining;
        this.#button.textContent = remaining
            ? this.#i18n.t('cell.hint_count', { current: this.#revealed + 1, total: this.#hints.length })
            : this.#i18n.t('cell.hint');
    }
}
