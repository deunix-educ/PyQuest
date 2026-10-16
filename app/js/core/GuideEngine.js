// Personnage-guide : choisit un message adapté à la situation, jamais le même deux fois de suite.
// Les messages viennent de app/js/i18n/guide.<lang>.json ; ici seulement la logique de variété.

// Humeur du dessin (voir ui/guideArt.js) pour chaque situation.
const MOODS = {
    level_start: 'happy',
    welcome_back: 'happy',
    success_step: 'happy',
    success_first_try: 'celebrate',
    success_after_retry: 'celebrate',
    error_runtime: 'thinking',
    fail_tests: 'thinking',
    suggest_hint: 'thinking',
    hint_revealed: 'thinking',
    interrupted: 'neutral',
    input_waiting: 'neutral',
    level_complete: 'celebrate',
    level_complete_replay: 'happy',
    streak: 'celebrate',
};

export class GuideEngine {
    #catalogs;
    #defaultLang;
    #random;
    #bags = new Map(); // `${lang}/${situation}` -> indices restants (tirage sans remise)
    #last = new Map(); // `${lang}/${situation}` -> dernier indice dit

    /**
     * @param {Record<string, Record<string, string[]>>} catalogs  Contenu de guide.fr.json, guide.en.json.
     * @param {object} [options]
     * @param {string} [options.defaultLang]
     * @param {() => number} [options.random]  Remplaçable pour des tests déterministes.
     */
    constructor(catalogs, { defaultLang = 'fr', random = Math.random } = {}) {
        this.#catalogs = catalogs;
        this.#defaultLang = defaultLang;
        this.#random = random;
    }

    static get situations() {
        return Object.keys(MOODS);
    }

    /**
     * @param {string} situation  Clé de MOODS (ex. 'success_step').
     * @param {string} lang
     * @param {Record<string, string|number>} [params]  Valeurs des {paramètres} du message.
     * @returns {{situation: string, mood: string, text: string}}
     */
    say(situation, lang, params = {}) {
        const catalog = this.#catalogs[lang]?.[situation] ? this.#catalogs[lang] : this.#catalogs[this.#defaultLang];
        const variants = catalog[situation];
        if (!variants || !(situation in MOODS)) {
            throw new Error(`Unknown guide situation: ${situation}`);
        }
        const text = variants[this.#nextIndex(`${lang}/${situation}`, variants.length)].replace(/\{(\w+)\}/g, (whole, name) => String(params[name] ?? whole));
        return { situation, mood: MOODS[situation], text };
    }

    /** Tirage sans remise : toutes les variantes passent avant qu'une se répète, jamais deux fois de suite. */
    #nextIndex(key, size) {
        if (size === 1) {
            return 0;
        }
        let bag = this.#bags.get(key) ?? [];
        if (bag.length === 0) {
            bag = this.#shuffled(size);
            // Le premier tirage du nouveau sac ne doit pas répéter le dernier message dit.
            if (bag[0] === this.#last.get(key)) {
                bag.push(bag.shift());
            }
        }
        const index = bag.shift();
        this.#bags.set(key, bag);
        this.#last.set(key, index);
        return index;
    }

    #shuffled(size) {
        const indices = Array.from({ length: size }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(this.#random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        return indices;
    }
}
