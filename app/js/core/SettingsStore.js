// Réglages utilisateur persistés (langue, taille du texte, thème, son, voix).

const STORAGE_KEY = 'settings';

export const DEFAULT_SETTINGS = Object.freeze({
    lang: 'fr',
    fontSize: 100, // en pourcentage de la taille de base
    theme: 'auto', // 'auto' | 'light' | 'dark'
    soundEnabled: true,
    volume: 0.8,
    voiceEnabled: false,
    voiceRate: 1,
});

export class SettingsStore extends EventTarget {
    #store;
    #settings = { ...DEFAULT_SETTINGS };

    /** @param {{get: Function, set: Function}} store  Magasin clé/valeur (voir KeyValueStores.js). */
    constructor(store) {
        super();
        this.#store = store;
    }

    get settings() {
        return { ...this.#settings };
    }

    async load() {
        const saved = await this.#store.get(STORAGE_KEY);
        // Seules les clés connues sont reprises : un ancien format ne casse rien.
        const known = Object.fromEntries(Object.entries(saved ?? {}).filter(([key]) => key in DEFAULT_SETTINGS));
        this.#settings = { ...DEFAULT_SETTINGS, ...known };
        return this.settings;
    }

    async update(key, value) {
        if (!(key in DEFAULT_SETTINGS)) {
            throw new Error(`Unknown setting: ${key}`);
        }
        this.#settings[key] = value;
        await this.#store.set(STORAGE_KEY, this.#settings);
        this.dispatchEvent(new CustomEvent('change', { detail: { key, value, settings: this.settings } }));
    }
}
