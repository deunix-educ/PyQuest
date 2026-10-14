// Traduction de l'interface : catalogues plats par langue, repli sur le français.

const FALLBACK_LANG = 'fr';

export class I18n extends EventTarget {
    #catalogs;
    #lang;

    /** @param {Record<string, Record<string, string>>} catalogs  Contenu de fr.json, en.json. */
    constructor(catalogs, lang = FALLBACK_LANG) {
        super();
        this.#catalogs = catalogs;
        this.#lang = catalogs[lang] ? lang : FALLBACK_LANG;
    }

    get lang() {
        return this.#lang;
    }

    get languages() {
        return Object.keys(this.#catalogs);
    }

    setLang(lang) {
        if (this.#catalogs[lang] && lang !== this.#lang) {
            this.#lang = lang;
            this.dispatchEvent(new CustomEvent('change', { detail: { lang } }));
        }
    }

    /** Traduit une clé ; les `{param}` sont remplacés. Une clé inconnue est renvoyée telle quelle. */
    t(key, params = {}) {
        const template = this.#catalogs[this.#lang]?.[key] ?? this.#catalogs[FALLBACK_LANG]?.[key] ?? key;
        return template.replace(/\{(\w+)\}/g, (whole, name) => String(params[name] ?? whole));
    }
}
