// Une cellule de code : éditeur, boutons, sortie, retour de validation.
// Émet les événements 'run' (detail: { code }), 'stop' et 'reset'. Aucune logique d'exécution ici.

import { el, renderInline, uniqueId } from './dom.js';
import { HintPanel } from './HintPanel.js';

export class CellView extends EventTarget {
    #i18n;
    #starter;
    #root;
    #editor;
    #output;
    #feedback;
    #runButton;
    #stopButton;
    #busy = false;

    /**
     * @param {import('../i18n/i18n.js').I18n} i18n
     * @param {object} options
     * @param {string} options.starter
     * @param {string} options.instruction  Consigne localisée.
     * @param {string[]} [options.hints]
     * @param {string|null} [options.solution]
     */
    constructor(i18n, { starter, instruction, hints = [], solution = null }) {
        super();
        this.#i18n = i18n;
        this.#starter = starter;

        const editorId = uniqueId('editor');
        const outputId = uniqueId('output');
        this.#editor = el('textarea', {
            id: editorId,
            class: 'code-editor',
            spellcheck: 'false',
            autocapitalize: 'off',
            autocomplete: 'off',
            autocorrect: 'off',
            rows: Math.max(3, starter.split('\n').length + 1),
            'aria-label': i18n.t('cell.editor'),
            'aria-describedby': `${editorId}-hint`,
            onkeydown: (event) => this.#onKeyDown(event),
        });
        this.#editor.value = starter;

        this.#runButton = el('button', { type: 'button', class: 'btn btn-primary', text: i18n.t('cell.run'), onclick: () => this.#emitRun() });
        this.#stopButton = el('button', {
            type: 'button',
            class: 'btn',
            hidden: true,
            text: i18n.t('cell.stop'),
            onclick: () => this.dispatchEvent(new CustomEvent('stop')),
        });
        const resetButton = el('button', { type: 'button', class: 'btn', text: i18n.t('cell.reset'), onclick: () => this.reset() });

        this.#output = el('pre', { id: outputId, class: 'cell-output', 'aria-live': 'polite', 'aria-label': i18n.t('cell.output') });
        this.#feedback = el('div', { class: 'cell-feedback', role: 'status' });

        const solutionBlock = solution
            ? el('details', { class: 'solution' }, el('summary', { text: i18n.t('cell.solution') }), el('pre', {}, el('code', { text: solution })))
            : null;

        this.#root = el(
            'section',
            { class: 'cell', tabindex: '-1' },
            el('p', { class: 'cell-instruction' }, renderInline(instruction)),
            this.#editor,
            el('p', { id: `${editorId}-hint`, class: 'cell-shortcut', text: i18n.t('cell.shortcut') }),
            el('div', { class: 'cell-actions' }, this.#runButton, this.#stopButton, resetButton, new HintPanel(i18n, hints).element),
            this.#output,
            this.#feedback,
            solutionBlock,
        );
    }

    get element() {
        return this.#root;
    }

    get code() {
        return this.#editor.value;
    }

    focus() {
        this.#editor.focus();
    }

    setBusy(busy) {
        this.#busy = busy;
        this.#runButton.disabled = busy;
        this.#runButton.textContent = this.#i18n.t(busy ? 'cell.running' : 'cell.run');
        this.#stopButton.hidden = !busy;
        this.#root.setAttribute('aria-busy', String(busy));
    }

    clearOutput() {
        this.#output.textContent = '';
        this.#feedback.replaceChildren();
    }

    appendOutput(text) {
        this.#output.append(document.createTextNode(text));
    }

    /** Remet le code de départ et vide la sortie. */
    reset() {
        this.#editor.value = this.#starter;
        this.clearOutput();
        this.dispatchEvent(new CustomEvent('reset'));
    }

    /** Affiche le résultat de ValidationEngine.validate(). */
    showValidation({ passed, results }) {
        if (passed) {
            // Le texte porte le sens : la couleur et l'icône ne font qu'appuyer.
            this.#feedback.replaceChildren(el('p', { class: 'feedback-ok' }, el('span', { 'aria-hidden': 'true', text: '✔ ' }), this.#i18n.t('cell.passed')));
            return;
        }
        const failures = results
            .filter((entry) => !entry.passed)
            .map((entry) => el('li', {}, entry.message ?? this.#i18n.t(`reason.${entry.reason}`)));
        this.#feedback.replaceChildren(
            el('p', { class: 'feedback-ko' }, el('span', { 'aria-hidden': 'true', text: '✘ ' }), this.#i18n.t('cell.failed')),
            el('ul', {}, ...failures),
        );
    }

    /** Affiche une erreur déjà traduite par ErrorTranslator. */
    showError({ title, explanation, tip, line, traceback }) {
        this.#feedback.replaceChildren(
            el(
                'div',
                { class: 'feedback-error' },
                el('p', { class: 'error-title' }, el('span', { 'aria-hidden': 'true', text: '🔍 ' }), title, line ? ` (${this.#i18n.t('cell.line', { line })})` : ''),
                el('p', { text: explanation }),
                el('p', {}, el('span', { 'aria-hidden': 'true', text: '💡 ' }), tip),
                traceback ? el('details', {}, el('summary', { text: this.#i18n.t('cell.details') }), el('pre', { text: traceback })) : null,
            ),
        );
    }

    #emitRun() {
        if (!this.#busy) {
            this.dispatchEvent(new CustomEvent('run', { detail: { code: this.code } }));
        }
    }

    #onKeyDown(event) {
        // Tab n'est pas capturé : il garde son rôle de navigation clavier (WCAG 2.1.2).
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            this.#emitRun();
        }
    }
}
