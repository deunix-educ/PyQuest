// Notifications éphémères (badges, XP). Région role="status" : annoncée sans voler le focus.

import { createBadgeIcon } from './badgeArt.js';
import { el } from './dom.js';

const DISPLAY_MS = 7000;

export class BadgeToast {
    #i18n;
    #root;

    constructor(i18n) {
        this.#i18n = i18n;
        this.#root = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    }

    get element() {
        return this.#root;
    }

    /** Affiche un message ; se ferme seul après quelques secondes ou au clic sur « Fermer ». */
    show(message, { icon = null } = {}) {
        const toast = el(
            'div',
            { class: 'toast' },
            icon,
            el('span', { text: message }),
            el('button', { type: 'button', class: 'btn', text: this.#i18n.t('toast.close'), onclick: () => toast.remove() }),
        );
        this.#root.append(toast);
        setTimeout(() => toast.remove(), DISPLAY_MS);
    }

    showBadge(badgeId) {
        const medal = el('span', { class: 'toast-badge' }, createBadgeIcon(badgeId, { earned: true }));
        this.show(this.#i18n.t('badge.earned', { name: this.#i18n.t(`badge.${badgeId}`) }), { icon: medal });
    }
}
