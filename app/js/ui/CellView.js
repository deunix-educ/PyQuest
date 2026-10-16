// Une cellule de code : éditeur, boutons, sortie, retour de validation.
// Émet les événements 'run' (detail: { code }), 'stop' et 'reset'. Aucune logique d'exécution ici.

import { el, renderInline, uniqueId } from './dom.js';
import { CodeEditor } from './CodeEditor.js';
import { DrawingView } from './DrawingView.js';
import { GuideBubble } from './GuideBubble.js';
import { HintPanel } from './HintPanel.js';

export class CellView extends EventTarget {
    #i18n;
    #starter;
    #root;
    #editor;
    #output;
    #drawing;
    #feedback;
    #guideSlot;
    #hintPanel;
    #runButton;
    #stopButton;
    #busy = false;
    #inputForm;
    #inputField;
    #resolveInput = null;

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
        this.#editor = new CodeEditor({
            value: starter,
            attrs: {
                id: editorId,
                rows: Math.max(3, starter.split('\n').length + 1),
                'aria-label': i18n.t('cell.editor'),
                'aria-describedby': `${editorId}-hint`,
            },
            onKeyDown: (event) => this.#onKeyDown(event),
        });

        this.#runButton = el('button', { type: 'button', class: 'btn btn-primary cell-run', text: i18n.t('cell.run'), onclick: () => this.#emitRun() });
        this.#stopButton = el('button', {
            type: 'button',
            class: 'btn',
            hidden: true,
            text: i18n.t('cell.stop'),
            onclick: () => this.dispatchEvent(new CustomEvent('stop')),
        });
        const resetButton = el('button', { type: 'button', class: 'btn', text: i18n.t('cell.reset'), onclick: () => this.reset() });

        this.#output = el('pre', { id: outputId, class: 'cell-output', 'aria-live': 'polite', 'aria-label': i18n.t('cell.output') });
        this.#drawing = new DrawingView(i18n);
        this.#feedback = el('div', { class: 'cell-feedback', role: 'status' });
        this.#guideSlot = el('div', { class: 'cell-guide' });
        this.#hintPanel = new HintPanel(i18n, hints, { onReveal: () => this.dispatchEvent(new CustomEvent('hint')) });

        // Saisie demandée par input() : formulaire affiché seulement pendant l'attente.
        const inputId = uniqueId('input');
        this.#inputField = el('input', { id: inputId, type: 'text', class: 'cell-input-field', autocomplete: 'off', spellcheck: 'false' });
        this.#inputForm = el(
            'form',
            { class: 'cell-input', hidden: true, onsubmit: (event) => this.#submitInput(event) },
            el('label', { for: inputId, text: i18n.t('cell.input_label') }),
            this.#inputField,
            el('button', { type: 'submit', class: 'btn btn-primary', text: i18n.t('cell.input_send') }),
        );

        const solutionBlock = solution
            ? el('details', { class: 'solution' }, el('summary', { text: i18n.t('cell.solution') }), el('pre', {}, el('code', { text: solution })))
            : null;

        this.#root = el(
            'section',
            { class: 'cell', tabindex: '-1' },
            el('p', { class: 'cell-instruction' }, renderInline(instruction)),
            this.#editor.element,
            el('p', { id: `${editorId}-hint`, class: 'cell-shortcut', text: i18n.t('cell.shortcut') }),
            el('div', { class: 'cell-actions' }, this.#runButton, this.#stopButton, resetButton, this.#hintPanel.element),
            this.#output,
            this.#drawing.element,
            this.#inputForm,
            this.#feedback,
            this.#guideSlot,
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
        this.#drawing.clear();
        this.#feedback.replaceChildren();
        this.#guideSlot.replaceChildren();
    }

    /** Reste-t-il des indices à révéler ? */
    get hasHintsLeft() {
        return this.#hintPanel.hasMore;
    }

    /** Affiche un message du personnage-guide sous le retour de validation. */
    showGuide(message) {
        this.#guideSlot.replaceChildren(new GuideBubble(message).element);
    }

    /** Affiche le dessin produit par `canvas.line` (rien si aucun trait). */
    showDrawing(segments) {
        this.#drawing.render(segments ?? []);
    }

    appendOutput(text) {
        this.#output.append(document.createTextNode(text));
    }

    /**
     * Demande une saisie à l'apprenant (appelé par input()). Résout avec le texte saisi, ou null
     * si la saisie est annulée (arrêt de la cellule).
     * @param {string} prompt  Invite déjà affichée dans la sortie par Python ; sert de repère pour les lecteurs d'écran.
     * @returns {Promise<string|null>}
     */
    requestInput(prompt) {
        this.cancelInput();
        this.#inputField.value = '';
        this.#inputField.setAttribute('aria-description', prompt);
        this.#inputForm.hidden = false;
        this.#inputField.focus();
        return new Promise((resolve) => {
            this.#resolveInput = resolve;
        });
    }

    /** Annule une saisie en attente (la promesse résout null). */
    cancelInput() {
        this.#inputForm.hidden = true;
        this.#resolveInput?.(null);
        this.#resolveInput = null;
    }

    #submitInput(event) {
        event.preventDefault();
        const answer = this.#inputField.value;
        this.#inputForm.hidden = true;
        // L'écho n'est que de l'affichage : il n'entre pas dans la sortie standard validée.
        this.appendOutput(`${answer}\n`);
        this.#resolveInput?.(answer);
        this.#resolveInput = null;
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
