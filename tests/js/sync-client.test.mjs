// SyncClient contre un faux serveur en mémoire qui reproduit le contrat de l'API Django
// (GET 200/404 JSON, PUT avec concurrence optimiste 200/409, DELETE 204, 401).
import { test } from 'node:test';
import assert from 'node:assert';
import { SyncClient } from '../../app/js/core/SyncClient.js';
import { ProgressStore } from '../../app/js/core/ProgressStore.js';
import { MemoryKeyValueStore } from '../../app/js/core/KeyValueStores.js';

const day = (s) => new Date(`${s}T10:00:00`);
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

class FakeServer {
    profiles = new Map(); // token -> { payload, version }
    calls = [];
    offline = false;
    onBeforePut = null; // pour simuler un autre appareil qui écrit entre le GET et le PUT

    fetch = async (url, options) => {
        this.calls.push(options.method);
        if (this.offline) throw new TypeError('network down');
        const token = (options.headers.Authorization ?? '').replace('Bearer ', '');
        if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return json(401, { error: 'token' });
        const profile = this.profiles.get(token);
        if (options.method === 'GET') {
            return profile ? json(200, { payload: profile.payload, updated_at: `v${profile.version}` }) : json(404, { error: 'none' });
        }
        if (options.method === 'DELETE') {
            this.profiles.delete(token);
            return new Response(null, { status: 204 });
        }
        if (this.onBeforePut) {
            const hook = this.onBeforePut;
            this.onBeforePut = null;
            hook(token);
        }
        const { payload, base } = JSON.parse(options.body);
        const current = this.profiles.get(token);
        if (current && base !== null && base !== `v${current.version}`) {
            return json(409, { error: 'changed', payload: current.payload, updated_at: `v${current.version}` });
        }
        this.profiles.set(token, { payload, version: (current?.version ?? 0) + 1 });
        return json(200, { updated_at: `v${this.profiles.get(token).version}` });
    };
}

async function device(server, { debounceMs = 5 } = {}) {
    const progress = new ProgressStore(new MemoryKeyValueStore());
    await progress.load();
    const sync = new SyncClient({ store: new MemoryKeyValueStore(), progress, endpoint: '/api/sync/', fetchFn: server.fetch, debounceMs });
    await sync.load();
    return { progress, sync };
}

test('jeton : 43 caractères URL-safe, tous différents', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => SyncClient.generateToken()));
    assert.equal(tokens.size, 50);
    for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(SyncClient.isValidToken([...tokens][0]));
    assert.ok(!SyncClient.isValidToken('court'));
    assert.ok(!SyncClient.isValidToken('a'.repeat(40) + '!'));
});

test('activer envoie la progression, un second appareil lié la récupère et les deux convergent', async () => {
    const server = new FakeServer();
    const a = await device(server);
    await a.progress.completeLevel('00-intro', 10, day('2026-10-14'));
    assert.deepEqual(await a.sync.enable(), { ok: true });
    assert.equal(a.sync.state.status, 'idle');
    assert.ok(a.sync.state.lastSync);

    const b = await device(server);
    await b.progress.completeLevel('01-hello', 20, day('2026-10-15'));
    let merged = 0;
    b.sync.addEventListener('merged', () => (merged += 1));
    assert.deepEqual(await b.sync.link(a.sync.state.token), { ok: true });
    assert.equal(merged, 1);
    assert.deepEqual(Object.keys(b.progress.snapshot().completedLevels).sort(), ['00-intro', '01-hello']);

    await a.sync.sync();
    assert.deepEqual(Object.keys(a.progress.snapshot().completedLevels).sort(), ['00-intro', '01-hello']);
    assert.equal(a.progress.snapshot().xp, 30);
});

test('un changement local est poussé automatiquement (debounce), sans boucle', async () => {
    const server = new FakeServer();
    const a = await device(server);
    await a.sync.enable();
    server.calls.length = 0;
    await a.progress.completeLevel('00-intro', 10, day('2026-10-14'));
    await a.progress.completeLevel('01-hello', 20, day('2026-10-14'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(server.calls, ['GET', 'PUT'], 'un seul cycle pour deux changements rapprochés');
    const stored = [...server.profiles.values()][0].payload;
    assert.equal(Object.keys(stored.completedLevels).length, 2);
});

test('conflit 409 : l\'écriture concurrente d\'un autre appareil est fusionnée, rien n\'est perdu', async () => {
    const server = new FakeServer();
    const a = await device(server);
    const b = await device(server);
    await a.sync.enable();
    await b.sync.link(a.sync.state.token);
    await a.progress.completeLevel('00-intro', 10, day('2026-10-14'));
    await b.progress.completeLevel('05-decide', 40, day('2026-10-14'));
    // B écrit entre le GET et le PUT de A.
    server.onBeforePut = async (token) => {
        const profile = server.profiles.get(token);
        const merged = JSON.parse(b.progress.export());
        server.profiles.set(token, { payload: { ...merged, completedLevels: { ...profile.payload.completedLevels, ...merged.completedLevels } }, version: profile.version + 1 });
    };
    assert.deepEqual(await a.sync.sync(), { ok: true });
    assert.deepEqual(Object.keys(a.progress.snapshot().completedLevels).sort(), ['00-intro', '05-decide']);
    const stored = [...server.profiles.values()][0].payload;
    assert.deepEqual(Object.keys(stored.completedLevels).sort(), ['00-intro', '05-decide']);
});

test('hors ligne : état d\'erreur, aucune exception, et le cycle suivant réussit', async () => {
    const server = new FakeServer();
    const a = await device(server);
    await a.progress.completeLevel('00-intro', 10, day('2026-10-14'));
    server.offline = true;
    assert.deepEqual(await a.sync.enable(), { ok: false, code: 'offline' });
    assert.deepEqual([a.sync.state.status, a.sync.state.error], ['error', 'offline']);
    server.offline = false;
    assert.deepEqual(await a.sync.sync(), { ok: true });
    assert.equal(a.sync.state.error, null);
    assert.equal([...server.profiles.values()].length, 1);
});

test('serveur sans API (404 non JSON) et réponses invalides : états explicites', async () => {
    const a = await device({ fetch: async () => new Response('<html>Not found</html>', { status: 404, headers: { 'content-type': 'text/html' } }) });
    assert.deepEqual(await a.sync.enable(), { ok: false, code: 'unavailable' });

    const hostile = await device({ fetch: async () => json(200, { payload: { version: 1, completedLevels: { x: { xp: 'a' } }, badges: {}, streak: {} }, updated_at: 'v1' }) });
    assert.deepEqual(await hostile.sync.enable(), { ok: false, code: 'invalid' });
    assert.equal(hostile.progress.snapshot().xp, 0);

    const refused = await device({ fetch: async () => json(401, { error: 'token' }) });
    assert.deepEqual(await refused.sync.enable(), { ok: false, code: 'unauthorized' });
});

test('lier avec un jeton invalide lève une erreur ; l\'état reste désactivé', async () => {
    const a = await device(new FakeServer());
    await assert.rejects(a.sync.link('trop-court'));
    assert.equal(a.sync.state.enabled, false);
    assert.deepEqual(await a.sync.sync(), { ok: false, code: 'disabled' });
});

test('désactiver : local seul, ou avec effacement serveur ; échec d\'effacement = on reste actif', async () => {
    const server = new FakeServer();
    const a = await device(server);
    await a.sync.enable();
    const token = a.sync.state.token;
    server.offline = true;
    assert.deepEqual(await a.sync.disable({ eraseRemote: true }), { ok: false, code: 'offline' });
    assert.equal(a.sync.state.enabled, true);
    server.offline = false;
    assert.deepEqual(await a.sync.disable({ eraseRemote: true }), { ok: true });
    assert.equal(a.sync.state.enabled, false);
    assert.equal(server.profiles.has(token), false);

    const b = await device(server);
    await b.sync.enable();
    await b.sync.disable();
    assert.equal(server.profiles.size, 1, 'sans effacement, les données du serveur restent');
});

test('le jeton survit au rechargement (magasin), pas la progression de la session précédente', async () => {
    const server = new FakeServer();
    const kv = new MemoryKeyValueStore();
    const progress = new ProgressStore(new MemoryKeyValueStore());
    await progress.load();
    const first = new SyncClient({ store: kv, progress, endpoint: '/x', fetchFn: server.fetch });
    await first.enable();
    const second = new SyncClient({ store: kv, progress, endpoint: '/x', fetchFn: server.fetch });
    await second.load();
    assert.equal(second.state.token, first.state.token);
    assert.equal(second.state.enabled, true);
});
