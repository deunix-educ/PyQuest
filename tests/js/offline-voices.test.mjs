import { test } from 'node:test';
import assert from 'node:assert';
import { OfflineVoices, AUDIO_CACHE } from '../../app/js/core/OfflineVoices.js';

// Faux CacheStorage minimal : match/put par URL.
function fakeCaches() {
    const stores = new Map();
    return {
        stores,
        open: async (name) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return { match: async (url) => store.get(String(url)), put: async (url, response) => void store.set(String(url), response) };
        },
    };
}

const manifests = {
    '00-intro': { fr: { aaa: {}, bbb: {} }, en: { ccc: {} } },
    '01-hello': { fr: { ddd: {} } },
    '02-none': {},
};

function server({ failUrls = [], offline = false } = {}) {
    const calls = [];
    const fetchFn = async (input) => {
        const url = String(input);
        calls.push(url);
        if (offline) throw new TypeError('offline');
        const id = url.match(/levels\/([^/]+)\/audio\/manifest\.json$/)?.[1];
        if (id) return id in manifests ? new Response(JSON.stringify(manifests[id])) : new Response('', { status: 404 });
        if (failUrls.some((bad) => url.endsWith(bad))) return new Response('', { status: 500 });
        return new Response('mp3');
    };
    return { fetchFn, calls };
}

const levelsUrl = 'https://x.test/levels/';
const ids = ['00-intro', '01-hello', '02-none', '99-missing'];

test('les URLs viennent des manifestes, par langue ; niveaux sans voix ou inconnus ignorés', async () => {
    const { fetchFn } = server();
    const voices = new OfflineVoices({ levelsUrl, fetchFn, cachesApi: fakeCaches() });
    assert.deepEqual(await voices.urlsFor(ids, 'fr'), [
        'https://x.test/levels/00-intro/audio/fr/aaa.mp3',
        'https://x.test/levels/00-intro/audio/fr/bbb.mp3',
        'https://x.test/levels/01-hello/audio/fr/ddd.mp3',
    ]);
    assert.deepEqual(await voices.urlsFor(ids, 'en'), ['https://x.test/levels/00-intro/audio/en/ccc.mp3']);
});

test('télécharger remplit le cache audio, avec progression ; seul ce qui manque est téléchargé', async () => {
    const caches = fakeCaches();
    const { fetchFn, calls } = server();
    const voices = new OfflineVoices({ levelsUrl, fetchFn, cachesApi: caches });
    assert.deepEqual(await voices.status(ids, 'fr'), { total: 3, cached: 0 });
    const progress = [];
    const result = await voices.download(ids, 'fr', { onProgress: (done, total) => progress.push([done, total]) });
    assert.deepEqual(result, { total: 3, downloaded: 3, failed: 0 });
    assert.deepEqual(progress.at(-1), [3, 3]);
    assert.equal(caches.stores.get(AUDIO_CACHE).size, 3);
    assert.deepEqual(await voices.status(ids, 'fr'), { total: 3, cached: 3 });

    const mp3Before = calls.filter((url) => url.endsWith('.mp3')).length;
    assert.deepEqual(await voices.download(ids, 'fr'), { total: 3, downloaded: 0, failed: 0 });
    assert.equal(calls.filter((url) => url.endsWith('.mp3')).length, mp3Before, 'rien de retéléchargé');
});

test('un échec isolé est compté sans bloquer les autres ; hors ligne, tout échoue proprement', async () => {
    const caches = fakeCaches();
    const voices = new OfflineVoices({ levelsUrl, fetchFn: server({ failUrls: ['bbb.mp3'] }).fetchFn, cachesApi: caches });
    assert.deepEqual(await voices.download(ids, 'fr'), { total: 3, downloaded: 2, failed: 1 });
    assert.equal(caches.stores.get(AUDIO_CACHE).size, 2);
    // Relancer ne réessaie que le fichier manquant.
    const retry = new OfflineVoices({ levelsUrl, fetchFn: server().fetchFn, cachesApi: caches });
    assert.deepEqual(await retry.download(ids, 'fr'), { total: 3, downloaded: 1, failed: 0 });

    const offline = new OfflineVoices({ levelsUrl, fetchFn: server({ offline: true }).fetchFn, cachesApi: fakeCaches() });
    assert.deepEqual(await offline.download(ids, 'fr'), { total: 0, downloaded: 0, failed: 0 });
});

test('annulation : plus aucun téléchargement après abort', async () => {
    const controller = new AbortController();
    const { fetchFn, calls } = server();
    const voices = new OfflineVoices({ levelsUrl, fetchFn, cachesApi: fakeCaches() });
    controller.abort();
    const result = await voices.download(ids, 'fr', { signal: controller.signal });
    assert.equal(result.downloaded, 0);
    assert.equal(calls.filter((url) => url.endsWith('.mp3')).length, 0);
});

test('sans API Cache : non pris en charge, aucune erreur', async () => {
    const voices = new OfflineVoices({ levelsUrl, fetchFn: server().fetchFn, cachesApi: undefined });
    assert.equal(voices.supported, false);
    assert.deepEqual(await voices.status(ids, 'fr'), { total: 3, cached: 0 });
    assert.deepEqual(await voices.download(ids, 'fr'), { total: 3, downloaded: 0, failed: 3 });
});
