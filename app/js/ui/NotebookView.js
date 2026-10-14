// Zone verticale façon notebook : étapes d'explication, cellules et messages s'empilent.

import { el, renderInline } from './dom.js';

export class NotebookView {
    #i18n;
    #root;
    #status;
    #onSpeak;

    /**
     * @param {import('../i18n/i18n.js').I18n} i18n
     * @param {object} [options]
     * @param {(text: string) => Promise<boolean>} [options.onSpeak]  Lecture vocale ; absent = pas de bouton.
     */
    constructor(i18n, { onSpeak = null } = {}) {
        this.#i18n = i18n;
        this.#onSpeak = onSpeak;
        this.#status = el('p', { class: 'notebook-status', role: 'status' });
        this.#root = el('main', { class: 'notebook', id: 'main' }, this.#status);
    }

    get element() {
        return this.#root;
    }

    clear() {
        this.#root.replaceChildren(this.#status);
        this.#status.textContent = '';
    }

    /** Message d'état global (chargement, échec). */
    setStatus(text) {
        this.#status.textContent = text;
    }

    /** Ajoute un élément et déplace le focus dessus pour les lecteurs d'écran. */
    add(element, { focus = true } = {}) {
        this.#root.append(element);
        if (focus) {
            element.scrollIntoView?.({ block: 'nearest' });
            (element.matches('[tabindex]') ? element : element.querySelector('[tabindex]'))?.focus?.();
        }
        return element;
    }

    /** Étape d'explication : texte, et bouton de lecture si la voix est demandée par le niveau. */
    addExplain({ text, voice, image }) {
        const children = [el('p', {}, renderInline(text))];
        if (image) {
            children.push(el('img', { src: image, alt: '' }));
        }
        if (voice && this.#onSpeak) {
            children.push(el('button', { type: 'button', class: 'btn', text: this.#i18n.t('voice.listen'), onclick: () => this.#onSpeak(text) }));
        }
        return this.add(el('section', { class: 'explain', tabindex: '-1' }, ...children));
    }

    /** Bouton « Continuer » ou équivalent ; retiré du DOM une fois cliqué. */
    addAction(label, onClick) {
        const button = el('button', {
            type: 'button',
            class: 'btn btn-primary',
            text: label,
            onclick: () => {
                button.remove();
                onClick();
            },
        });
        return this.add(el('div', { class: 'notebook-action' }, button), { focus: false });
    }
}
