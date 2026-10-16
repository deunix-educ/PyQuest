// Client de synchronisation optionnelle de la progression avec le backend Django (même domaine).
// Aucun compte : un jeton secret généré ici identifie le profil (le serveur n'en garde que le hash).
// Cycle : GET (fusion locale) puis PUT de l'état fusionné ; la fusion se fait toujours côté client
// (ProgressStore.import), le serveur ne fait que stocker. Concurrence optimiste : si un autre
// appareil a écrit entre-temps, le serveur répond 409 avec son état, on fusionne et on réessaie.
// L'application ne dépend jamais de ce module pour fonctionner : toute erreur est un état, pas une exception.

const STORAGE_KEY = 'sync';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 10000;

export class SyncClient extends EventTarget {
    #store;
    #progress;
    #fetch;
    #endpoint;
    #debounceMs;
    #now;
    #token = null;
    #lastSync = null;
    #status = 'off'; // 'off' | 'idle' | 'syncing' | 'error'
    #error = null; // 'offline' | 'unauthorized' | 'unavailable' | 'rejected' | 'invalid'
    #running = null;
    #rerun = false;
    #timer = null;
    #applying = false;

    /**
     * @param {object} options
     * @param {{get: Function, set: Function}} options.store  Magasin clé/valeur du jeton.
     * @param {import('./ProgressStore.js').ProgressStore} options.progress
     * @param {string} options.endpoint  URL de l'API (même domaine que l'application).
     */
    constructor({ store, progress, endpoint, fetchFn = (...args) => globalThis.fetch(...args), debounceMs = 2000, now = () => new Date() }) {
        super();
        this.#store = store;
        this.#progress = progress;
        this.#endpoint = endpoint;
        this.#fetch = fetchFn;
        this.#debounceMs = debounceMs;
        this.#now = now;
        progress.addEventListener('change', () => this.#onProgressChange());
    }

    /** Jeton aléatoire de 256 bits, base64url (43 caractères) ; jamais dérivé d'une donnée personnelle. */
    static generateToken(cryptoApi = globalThis.crypto) {
        const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
        return btoa(String.fromCharCode(...bytes))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '');
    }

    static isValidToken(token) {
        return typeof token === 'string' && TOKEN_PATTERN.test(token);
    }

    get state() {
        return { enabled: this.#token !== null, token: this.#token, status: this.#status, error: this.#error, lastSync: this.#lastSync };
    }

    async load() {
        const saved = await this.#store.get(STORAGE_KEY);
        if (saved && SyncClient.isValidToken(saved.token)) {
            this.#token = saved.token;
            this.#lastSync = typeof saved.lastSync === 'string' ? saved.lastSync : null;
            this.#status = 'idle';
        }
        return this.state;
    }

    /** Au démarrage : si la synchronisation est active, un cycle immédiat. */
    start() {
        return this.#token ? this.sync() : Promise.resolve({ ok: false, code: 'disabled' });
    }

    /** Active la synchronisation avec un nouveau profil, puis envoie la progression locale. */
    async enable() {
        await this.#setToken(SyncClient.generateToken());
        return this.sync();
    }

    /** Rejoint un profil existant (jeton copié depuis un autre appareil) : les progressions sont fusionnées. */
    async link(token) {
        const clean = String(token ?? '').trim();
        if (!SyncClient.isValidToken(clean)) {
            throw new Error('Invalid sync token');
        }
        await this.#setToken(clean);
        return this.sync();
    }

    /**
     * Désactive localement ; avec `eraseRemote`, supprime d'abord les données du serveur
     * (si l'effacement échoue, on reste actif pour pouvoir réessayer).
     */
    async disable({ eraseRemote = false } = {}) {
        if (this.#timer !== null) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
        if (eraseRemote && this.#token) {
            const outcome = await this.#call('DELETE');
            if (outcome.code || outcome.status !== 204) {
                return { ok: false, code: outcome.code ?? (outcome.status === 401 ? 'unauthorized' : 'unavailable') };
            }
        }
        this.#token = null;
        this.#lastSync = null;
        this.#status = 'off';
        this.#error = null;
        await this.#store.set(STORAGE_KEY, { token: null, lastSync: null });
        this.#emitChange();
        return { ok: true };
    }

    /** Un cycle complet ; les appels simultanés sont regroupés (un cycle de plus au plus). Ne lève jamais. */
    sync() {
        if (!this.#token) {
            return Promise.resolve({ ok: false, code: 'disabled' });
        }
        if (this.#running) {
            this.#rerun = true;
            return this.#running;
        }
        this.#running = (async () => {
            let result;
            do {
                this.#rerun = false;
                result = await this.#cycle();
            } while (this.#rerun && result.ok);
            return result;
        })().finally(() => {
            this.#running = null;
        });
        return this.#running;
    }

    async #setToken(token) {
        this.#token = token;
        this.#lastSync = null;
        this.#status = 'idle';
        this.#error = null;
        await this.#persist();
        this.#emitChange();
    }

    #onProgressChange() {
        // Les changements dus à une fusion venant du serveur ne repartent pas vers le serveur.
        if (!this.#token || this.#applying) {
            return;
        }
        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => {
            this.#timer = null;
            this.sync();
        }, this.#debounceMs);
    }

    async #cycle() {
        this.#status = 'syncing';
        this.#error = null;
        this.#emitChange();

        let base = null;
        const first = await this.#call('GET');
        if (first.code) {
            return this.#fail(first.code);
        }
        if (first.status === 200) {
            base = first.body.updated_at ?? null;
            if (!(await this.#merge(first.body.payload))) {
                return this.#fail('invalid');
            }
        } else if (first.status !== 404 || !first.fromApi) {
            // 404 d'un serveur statique (sans Django) : la synchronisation n'est pas disponible ici.
            return this.#fail(first.status === 401 ? 'unauthorized' : 'unavailable');
        }

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const put = await this.#call('PUT', { payload: JSON.parse(this.#progress.export()), base });
            if (put.code) {
                return this.#fail(put.code);
            }
            if (put.status === 200) {
                this.#lastSync = this.#now().toISOString();
                this.#status = 'idle';
                await this.#persist();
                this.#emitChange();
                return { ok: true };
            }
            if (put.status === 409) {
                // Un autre appareil a écrit entre notre lecture et notre envoi : on fusionne son état.
                base = put.body.updated_at ?? null;
                if (!(await this.#merge(put.body.payload))) {
                    return this.#fail('invalid');
                }
                continue;
            }
            return this.#fail(put.status === 401 ? 'unauthorized' : put.status === 400 || put.status === 413 ? 'rejected' : 'unavailable');
        }
        return this.#fail('unavailable');
    }

    /** Fusionne un état venant du serveur (donnée non fiable : ProgressStore la valide). */
    async #merge(payload) {
        const before = this.#progress.export();
        this.#applying = true;
        try {
            await this.#progress.import(JSON.stringify(payload));
        } catch {
            return false;
        } finally {
            this.#applying = false;
        }
        if (this.#progress.export() !== before) {
            this.dispatchEvent(new CustomEvent('merged'));
        }
        return true;
    }

    /** @returns {Promise<{status?: number, body?: any, fromApi?: boolean, code?: string}>} `code` seulement si la requête n'a pas abouti. */
    async #call(method, body) {
        const options = {
            method,
            headers: { Authorization: `Bearer ${this.#token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            cache: 'no-store',
        };
        if (body !== undefined) {
            options.body = JSON.stringify(body);
        }
        if (typeof AbortSignal?.timeout === 'function') {
            options.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        }
        let response;
        try {
            response = await this.#fetch(this.#endpoint, options);
        } catch {
            return { code: 'offline' };
        }
        const fromApi = (response.headers.get('content-type') ?? '').includes('application/json');
        let parsed = null;
        if (fromApi && response.status !== 204) {
            try {
                parsed = await response.json();
            } catch {
                parsed = null;
            }
        }
        return { status: response.status, body: parsed ?? {}, fromApi };
    }

    #fail(code) {
        this.#status = 'error';
        this.#error = code;
        this.#emitChange();
        return { ok: false, code };
    }

    async #persist() {
        await this.#store.set(STORAGE_KEY, { token: this.#token, lastSync: this.#lastSync });
    }

    #emitChange() {
        this.dispatchEvent(new CustomEvent('change', { detail: this.state }));
    }
}
