// Étagère de badges : médailles illustrées, obtenues ou à débloquer, avec leur condition en texte.

import { el } from './dom.js';
import { createBadgeIcon } from './badgeArt.js';

export class BadgeShelf {
    #i18n;
    #root;

    constructor(i18n) {
        this.#i18n = i18n;
        this.#root = el('section', { class: 'badge-shelf', 'aria-labelledby': 'badge-shelf-title' });
    }

    get element() {
        return this.#root;
    }

    /**
     * @param {object} data
     * @param {string[]} data.ids  Tous les badges existants, dans l'ordre d'affichage.
     * @param {Record<string, string>} data.earned  { id: date ISO d'obtention }.
     */
    render({ ids, earned }) {
        const t = (key, params) => this.#i18n.t(key, params);
        const earnedCount = ids.filter((id) => id in earned).length;
        const items = ids.map((id) => {
            const isEarned = id in earned;
            const status = isEarned
                ? t('badge.earned_on', { date: new Date(earned[id]).toLocaleDateString(this.#i18n.lang) })
                : t('badge.locked');
            return el(
                'li',
                { class: `badge-item ${isEarned ? 'is-earned' : 'is-locked'}` },
                el('div', { class: 'badge-medal' }, createBadgeIcon(id, { earned: isEarned })),
                el('div', { class: 'badge-info' }, el('strong', { class: 'badge-name', text: t(`badge.${id}`) }), el('span', { class: 'badge-desc', text: t(`badge.${id}.desc`) }), el('span', { class: 'badge-status', text: status })),
            );
        });
        this.#root.replaceChildren(
            el('h3', { id: 'badge-shelf-title', class: 'badge-shelf-title', text: t('badges.title') }),
            el('p', { class: 'badge-count', text: t('badges.count', { earned: earnedCount, total: ids.length }) }),
            el('ul', { class: 'badge-list' }, ...items),
        );
    }
}
