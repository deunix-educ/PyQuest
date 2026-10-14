// Magasins clé/valeur asynchrones : IndexedDB en production, mémoire en repli et pour les tests.
// Interface commune : async get(key) -> valeur|undefined, async set(key, value).

export class IndexedDbKeyValueStore {
    #dbName;
    #storeName = 'kv';
    #db = null;

    constructor(dbName = 'pyquest') {
        this.#dbName = dbName;
    }

    async get(key) {
        const store = await this.#store('readonly');
        return this.#promisify(store.get(key));
    }

    async set(key, value) {
        const store = await this.#store('readwrite');
        await this.#promisify(store.put(value, key));
    }

    async #store(mode) {
        if (!this.#db) {
            this.#db = await this.#open();
        }
        return this.#db.transaction(this.#storeName, mode).objectStore(this.#storeName);
    }

    #open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.#dbName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(this.#storeName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    #promisify(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

export class MemoryKeyValueStore {
    #data = new Map();

    async get(key) {
        return this.#data.get(key);
    }

    async set(key, value) {
        // Copie structurée, comme IndexedDB : pas de partage de référence avec l'appelant.
        this.#data.set(key, structuredClone(value));
    }
}
