// Éditeur de code coloré. Un <textarea> réel reste le contrôle (clavier, lecteurs d'écran,
// saisie mobile) ; un <pre> placé derrière affiche le même code coloré (aria-hidden).

import { el } from './dom.js';
import { tokenizePython } from './highlightPython.js';

const MIN_ROWS = 3;
const INDENT = '    '; // 4 espaces, convention du projet

export class CodeEditor {
    #root;
    #textarea;
    #highlight;
    // Échap suspend la capture de Tab : le clavier ne reste jamais piégé dans l'éditeur (WCAG 2.1.2).
    #tabReleased = false;

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
            onkeydown: (event) => {
                this.#onKeyDown(event);
                onKeyDown(event);
            },
            onblur: () => (this.#tabReleased = false),
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

    /** Tab indente (Maj+Tab désindente) ; Échap puis Tab quitte l'éditeur. */
    #onKeyDown(event) {
        if (event.key === 'Escape') {
            this.#tabReleased = true;
            return;
        }
        if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) {
            if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
                this.#tabReleased = false;
            }
            return;
        }
        if (this.#tabReleased) {
            return; // Tab garde son rôle de navigation
        }
        event.preventDefault();
        const { selectionStart: start, selectionEnd: end, value } = this.#textarea;
        const multiline = value.slice(start, end).includes('\n');
        if (event.shiftKey || multiline) {
            this.#shiftLines(start, end, event.shiftKey ? -1 : 1);
        } else {
            // Complète jusqu'à la prochaine colonne multiple de 4.
            const column = start - (value.lastIndexOf('\n', start - 1) + 1);
            this.#replace(start, end, INDENT.slice(column % INDENT.length));
        }
    }

    /** Indente (+1) ou désindente (-1) toutes les lignes touchées par la sélection. */
    #shiftLines(start, end, direction) {
        const { value } = this.#textarea;
        const from = value.lastIndexOf('\n', start - 1) + 1;
        // Une sélection qui se termine en début de ligne ne touche pas cette dernière ligne.
        const to = end > start && value[end - 1] === '\n' ? end - 1 : end;
        const lines = value.slice(from, to).split('\n');
        let firstDelta = 0;
        let total = 0;
        const changed = lines.map((line, index) => {
            let next = line;
            if (direction > 0) {
                next = line === '' ? line : INDENT + line;
            } else {
                const remove = /^ {1,4}|^\t/.exec(line)?.[0].length ?? 0;
                next = line.slice(remove);
            }
            const delta = next.length - line.length;
            if (index === 0) {
                firstDelta = delta;
            }
            total += delta;
            return next;
        });
        this.#replace(from, to, changed.join('\n'), Math.max(from, start + firstDelta), Math.max(from, end + total));
    }

    /** Remplace [start, end) par `text` en conservant l'historique d'annulation quand le navigateur le permet. */
    #replace(start, end, text, selectionStart = start + text.length, selectionEnd = selectionStart) {
        const area = this.#textarea;
        area.setSelectionRange(start, end);
        // execCommand est obsolète mais reste le seul moyen d'insérer en gardant Ctrl+Z ; repli : setRangeText.
        let done = false;
        try {
            done = document.execCommand('insertText', false, text);
        } catch {
            done = false;
        }
        if (!done) {
            area.setRangeText(text, start, end, 'end');
            this.#render();
        }
        area.setSelectionRange(selectionStart, selectionEnd);
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
