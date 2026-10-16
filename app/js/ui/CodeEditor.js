// Éditeur de code coloré. Un <textarea> réel reste le contrôle (clavier, lecteurs d'écran,
// saisie mobile) ; un <pre> placé derrière affiche le même code coloré (aria-hidden).

import { el } from './dom.js';
import { tokenizePython } from './highlightPython.js';

const MIN_ROWS = 3;

export class CodeEditor {
    #root;
    #textarea;
    #highlight;

    /**
     * @param {object} options
     * @param {string} options.value
     * @param {Record<string, string>} [options.attrs]  Attributs du textarea (id, aria-label…).
     * @param {(event: KeyboardEvent) => void} [options.onKeyDown]
     */
    constructor({ value, attrs = {}, onKeyDown = () => {} }) {
        this.#highlight = el('pre', { class: 'code-highlight', 'aria-hidden': 'true' });
        this.#textarea = el('textarea', {
            class: 'code-editor',
            wrap: 'off',
            spellcheck: 'false',
            autocapitalize: 'off',
            autocomplete: 'off',
            autocorrect: 'off',
            ...attrs,
            oninput: () => this.#render(),
            onscroll: () => this.#syncScroll(),
            onkeydown: onKeyDown,
        });
        this.#root = el('div', { class: 'code-editor-wrap' }, this.#highlight, this.#textarea);
        this.value = value;
    }

    get element() {
        return this.#root;
    }

    get value() {
        return this.#textarea.value;
    }

    set value(code) {
        this.#textarea.value = code;
        this.#render();
    }

    focus() {
        this.#textarea.focus();
    }

    #render() {
        const code = this.#textarea.value;
        this.#textarea.rows = Math.max(MIN_ROWS, code.split('\n').length + 1);
        const nodes = tokenizePython(code).map(({ type, text }) =>
            type === 'text' ? document.createTextNode(text) : el('span', { class: `tok-${type}`, text }),
        );
        this.#highlight.replaceChildren(...nodes);
        this.#syncScroll();
    }

    #syncScroll() {
        this.#highlight.scrollTop = this.#textarea.scrollTop;
        this.#highlight.scrollLeft = this.#textarea.scrollLeft;
    }
}
