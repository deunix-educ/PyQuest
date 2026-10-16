// Panneau coulissant (tiroir) accessible : dialogue modal avec focus piégé, Échap, clic sur le voile,
// retour du focus au déclencheur, reste de la page rendu inerte pendant l'ouverture.
// Émet 'open' et 'close'.

import { el, uniqueId } from './dom.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export class Drawer extends EventTarget {
    #side;
    #panel;
    #overlay;
    #titleElement;
    #closeButton;
    #trigger;
    #inertTargets;
    #isOpen = false;

    /**
     * @param {object} options
     * @param {'left'|'right'} options.side
     * @param {string} options.title  Titre (h2) du tiroir.
     * @param {string} options.closeLabel  Libellé accessible du bouton de fermeture.
     * @param {HTMLElement} options.content  Contenu du tiroir.
     * @param {HTMLElement} options.trigger  Bouton qui ouvre le tiroir (reçoit aria-expanded).
     * @param {HTMLElement[]} [options.inertTargets]  Zones rendues inertes pendant l'ouverture.
     */
    constructor({ side, title, closeLabel, content, trigger, inertTargets = [] }) {
        super();
        this.#side = side;
        this.#trigger = trigger;
        this.#inertTargets = inertTargets;
        const titleId = uniqueId('drawer-title');
        const panelId = uniqueId('drawer');

        this.#titleElement = el('h2', { id: titleId, class: 'drawer-title', text: title });
        this.#closeButton = el('button', { type: 'button', class: 'btn drawer-close', 'aria-label': closeLabel, onclick: () => this.close() }, el('span', { 'aria-hidden': 'true', text: '✕' }));
        this.#panel = el(
            'aside',
            { id: panelId, class: `drawer drawer-${side}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, onkeydown: (event) => this.#onKeyDown(event) },
            el('div', { class: 'drawer-header' }, this.#titleElement, this.#closeButton),
            el('div', { class: 'drawer-body' }, content),
        );
        this.#overlay = el('div', { class: 'drawer-overlay', onclick: () => this.close() });

        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', panelId);
        trigger.setAttribute('aria-expanded', 'false');
        trigger.addEventListener('click', () => this.toggle());
    }

    /** Éléments à insérer dans le document (voile puis panneau). */
    get elements() {
        return [this.#overlay, this.#panel];
    }

    get isOpen() {
        return this.#isOpen;
    }

    setTitle(title) {
        this.#titleElement.textContent = title;
    }

    setCloseLabel(label) {
        this.#closeButton.setAttribute('aria-label', label);
    }

    open() {
        if (this.#isOpen) {
            return;
        }
        this.#isOpen = true;
        this.#panel.classList.add('is-open');
        this.#overlay.classList.add('is-open');
        this.#trigger.setAttribute('aria-expanded', 'true');
        this.#inertTargets.forEach((target) => target.setAttribute('inert', ''));
        this.#closeButton.focus();
        this.dispatchEvent(new CustomEvent('open'));
    }

    close({ restoreFocus = true } = {}) {
        if (!this.#isOpen) {
            return;
        }
        this.#isOpen = false;
        this.#panel.classList.remove('is-open');
        this.#overlay.classList.remove('is-open');
        this.#trigger.setAttribute('aria-expanded', 'false');
        this.#inertTargets.forEach((target) => target.removeAttribute('inert'));
        if (restoreFocus) {
            this.#trigger.focus();
        }
        this.dispatchEvent(new CustomEvent('close'));
    }

    toggle() {
        if (this.#isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    #onKeyDown(event) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.close();
            return;
        }
        if (event.key !== 'Tab') {
            return;
        }
        // Piège à focus : Tab et Maj+Tab restent dans le tiroir.
        const focusable = [...this.#panel.querySelectorAll(FOCUSABLE)].filter((element) => !element.hidden);
        if (focusable.length === 0) {
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
}
