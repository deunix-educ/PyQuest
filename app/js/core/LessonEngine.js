// Charge le manifeste et les niveaux (YAML) ; fournit des LevelSession localisées.

import yaml from '../lib/js-yaml/js-yaml.mjs';
import { LevelSession } from './LevelSession.js';

export class LessonEngine {
    #levelsUrl;
    #fetch;
    #parseYaml;
    #manifest = null;
    #levels = new Map();

    /**
     * @param {object} [options]
     * @param {string} [options.levelsUrl]  Racine des niveaux, avec slash final.
     * @param {typeof fetch} [options.fetchFn]  Remplaçable pour les tests.
     * @param {(text: string) => unknown} [options.parseYaml]
     */
    constructor({ levelsUrl = '/levels/', fetchFn = (...args) => fetch(...args), parseYaml = (text) => yaml.load(text) } = {}) {
        this.#levelsUrl = levelsUrl;
        this.#fetch = fetchFn;
        this.#parseYaml = parseYaml;
    }

    /** Liste ordonnée des niveaux : [{ id, requires }]. */
    async listLevels() {
        if (!this.#manifest) {
            const response = await this.#get('manifest.json');
            this.#manifest = JSON.parse(await response.text());
        }
        return this.#manifest.levels;
    }

    /** Niveau brut, mis en cache. */
    async loadLevel(id) {
        if (!this.#levels.has(id)) {
            const known = (await this.listLevels()).some((entry) => entry.id === id);
            if (!known) {
                throw new Error(`Unknown level: ${id}`);
            }
            const response = await this.#get(`${id}/level.yaml`);
            const level = this.#parseYaml(await response.text());
            if (level?.id !== id) {
                throw new Error(`Level file for ${id} declares id ${level?.id}`);
            }
            this.#levels.set(id, level);
        }
        return this.#levels.get(id);
    }

    /** Ouvre une session de parcours dans la langue donnée. */
    async startLevel(id, lang = 'fr') {
        const level = await this.loadLevel(id);
        return new LevelSession(level, lang, new URL(`${id}/`, new URL(this.#levelsUrl, globalThis.location?.href ?? 'http://localhost/')).href);
    }

    async #get(path) {
        const response = await this.#fetch(`${this.#levelsUrl}${path}`);
        if (!response.ok) {
            throw new Error(`Cannot load ${path}: HTTP ${response.status}`);
        }
        return response;
    }
}
