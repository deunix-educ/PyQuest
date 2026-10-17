// « À propos » : ce qu'est PyQuest, comment ça marche, licence, contact et crédits (dont l'attribution CC BY 4.0
// exigée par la voix française). Contenu construit sans HTML interprété ; textes dans les catalogues fr/en.

import { el } from './dom.js';

export const CONTACT_EMAIL = 'dd@linuxtarn.org';
export const COPYRIGHT_YEAR = 2026;

// name, rôle (clé i18n), licence, adresse. Les noms et licences ne se traduisent pas.
const CREDITS = [
    { name: 'Python (CPython)', role: 'about.credit.python', license: 'PSF License', url: 'https://www.python.org/' },
    { name: 'Pyodide', role: 'about.credit.pyodide', license: 'MPL-2.0', url: 'https://pyodide.org/' },
    { name: 'Piper', role: 'about.credit.piper', license: 'GPL-3.0', url: 'https://github.com/OHF-Voice/piper1-gpl' },
    { name: 'SIWIS French Speech Synthesis Database', role: 'about.credit.voice_fr', license: 'CC BY 4.0', url: 'https://datashare.is.ed.ac.uk/handle/10283/2353' },
    { name: 'LJ Speech', role: 'about.credit.voice_en', license: 'Public domain', url: 'https://keithito.com/LJ-Speech-Dataset/' },
    { name: 'Atkinson Hyperlegible', role: 'about.credit.font', license: 'OFL 1.1', url: 'https://brailleinstitute.org/freefont' },
    { name: 'JetBrains Mono', role: 'about.credit.font_code', license: 'OFL 1.1', url: 'https://www.jetbrains.com/lp/mono/' },
    { name: 'js-yaml', role: 'about.credit.yaml', license: 'MIT', url: 'https://github.com/nodeca/js-yaml' },
    { name: '@cfworker/json-schema', role: 'about.credit.schema', license: 'MIT', url: 'https://github.com/cfworker/cfworker' },
];

export class AboutPanel {
    #i18n;
    #root;

    /** @param {import('../i18n/i18n.js').I18n} i18n */
    constructor(i18n) {
        this.#i18n = i18n;
        this.#root = el('div', { class: 'about' });
    }

    get element() {
        return this.#root;
    }

    render() {
        const t = (key, params) => this.#i18n.t(key, params);
        const section = (titleKey, ...content) => el('section', { class: 'about-section' }, el('h3', { text: t(titleKey) }), ...content);
        const externalLink = (url, text) => el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text });
        this.#root.replaceChildren(
            section('about.what.title', el('p', { text: t('about.what.text') })),
            section('about.how.title', el('ul', {}, ...[1, 2, 3, 4].map((n) => el('li', { text: t(`about.how.${n}`) })))),
            section(
                'about.license.title',
                el('p', { text: t('about.license.text', { year: COPYRIGHT_YEAR }) }),
                el('p', {}, el('a', { href: 'LICENSE.txt', target: '_blank', rel: 'noopener', text: t('about.license.read') })),
            ),
            section('about.contact.title', el('p', {}, t('about.contact.text'), ' ', el('a', { href: `mailto:${CONTACT_EMAIL}`, text: CONTACT_EMAIL }))),
            section(
                'about.credits.title',
                el('p', { text: t('about.credits.intro') }),
                el(
                    'ul',
                    { class: 'about-credits' },
                    ...CREDITS.map((credit) => el('li', {}, externalLink(credit.url, credit.name), ` — ${t(credit.role)} (${credit.license})`)),
                ),
                el('p', { class: 'hint', text: t('about.credits.cc') }),
            ),
        );
    }
}
