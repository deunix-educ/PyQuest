// Narration Piper disponible hors ligne : les fichiers mp3 pré-générés sont stockés dans le cache `pyquest-audio`
// (le même que celui lu par le service worker). Sans cela, seuls les extraits déjà écoutés en ligne sont disponibles
// hors connexion, et la lecture se rabat sur la voix du système. Les fichiers sont nommés d'après leur contenu : un
// fichier en cache n'est donc jamais périmé et le cache survit aux mises à jour de l'application.

export const AUDIO_CACHE = 'pyquest-audio';

export class OfflineVoices extends EventTarget {
    #levelsUrl;
    #fetch;
    #caches;
    #manifests = new Map();

    /**
     * @param {object} options
     * @param {string} options.levelsUrl  Racine des niveaux, avec slash final.
     * @param {typeof fetch} [options.fetchFn]
     * @param {CacheStorage|undefined} [options.cachesApi]  Remplaçable pour les tests.
     */
    constructor({ levelsUrl, fetchFn = (...args) => fetch(...args), cachesApi = globalThis.caches }) {
        super();
        this.#levelsUrl = levelsUrl;
        this.#fetch = fetchFn;
        this.#caches = cachesApi;
    }

    /** Faux si le navigateur n'a pas l'API Cache (page non sécurisée) : la fonction est alors masquée. */
    get supported() {
        return this.#caches !== undefined;
    }

    /** URLs des narrations des niveaux donnés, dans la langue donnée. */
    async urlsFor(levelIds, lang) {
        const lists = await Promise.all(levelIds.map((id) => this.#levelUrls(id, lang)));
        return lists.flat();
    }

    /** @returns {Promise<{total: number, cached: number}>} */
    async status(levelIds, lang) {
        const urls = await this.urlsFor(levelIds, lang);
        if (!this.supported) {
            return { total: urls.length, cached: 0 };
        }
        const cache = await this.#caches.open(AUDIO_CACHE);
        const hits = await Promise.all(urls.map(async (url) => (await cache.match(url)) !== undefined));
        return { total: urls.length, cached: hits.filter(Boolean).length };
    }

    /**
     * Télécharge dans le cache les narrations manquantes (celles déjà en cache ne sont pas retéléchargées).
     * @param {string[]} levelIds
     * @param {string} lang
     * @param {object} [options]
     * @param {(done: number, total: number) => void} [options.onProgress]
     * @param {AbortSignal} [options.signal]
     * @returns {Promise<{total: number, downloaded: number, failed: number}>}
     */
    async download(levelIds, lang, { onProgress = () => {}, signal } = {}) {
        const urls = await this.urlsFor(levelIds, lang);
        if (!this.supported) {
            return { total: urls.length, downloaded: 0, failed: urls.length };
        }
        const cache = await this.#caches.open(AUDIO_CACHE);
        const missing = [];
        for (const url of urls) {
            if ((await cache.match(url)) === undefined) {
                missing.push(url);
            }
        }
        let done = urls.length - missing.length;
        let downloaded = 0;
        let failed = 0;
        onProgress(done, urls.length);
        const queue = [...missing];
        const worker = async () => {
            while (queue.length > 0 && !signal?.aborted) {
                const url = queue.shift();
                try {
                    const response = await this.#fetch(url, { signal });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    await cache.put(url, response);
                    downloaded += 1;
                } catch {
                    failed += 1;
                }
                done += 1;
                onProgress(done, urls.length);
            }
        };
        // Deux téléchargements en parallèle : assez rapide sans saturer une connexion modeste.
        await Promise.all([worker(), worker()]);
        return { total: urls.length, downloaded, failed };
    }

    async #levelUrls(id, lang) {
        const manifest = await this.#manifest(id);
        return Object.keys(manifest[lang] ?? {}).map((key) => new URL(`${id}/audio/${lang}/${key}.mp3`, this.#levelsUrl).href);
    }

    /** Manifeste de narration d'un niveau ({} s'il n'a pas de voix ou si le chargement échoue). */
    async #manifest(id) {
        if (!this.#manifests.has(id)) {
            let manifest = {};
            try {
                const response = await this.#fetch(new URL(`${id}/audio/manifest.json`, this.#levelsUrl));
                if (response.ok) {
                    manifest = await response.json();
                }
            } catch {
                manifest = {};
            }
            // Un échec n'est pas mémorisé (réseau coupé) ; un succès l'est.
            if (Object.keys(manifest).length === 0) {
                return manifest;
            }
            this.#manifests.set(id, manifest);
        }
        return this.#manifests.get(id);
    }
}
