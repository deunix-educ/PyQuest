// Service worker : app shell hors ligne.
// - Coquille de l'app : pré-cachée à l'installation.
// - Pyodide vendorisé, niveaux, scripts : mis en cache à la première utilisation (hors ligne ensuite).
// Les en-têtes COOP/COEP du document viennent du serveur ; ce worker ne les fabrique pas.

const CACHE_VERSION = 'pyquest-v1';

const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'js/main.js'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }
    // Niveaux : réseau d'abord (contenu qui évolue), cache en repli hors ligne.
    // Le reste (code, Pyodide) : cache d'abord, rempli à la première requête.
    const networkFirst = url.pathname.startsWith('/levels/') || request.mode === 'navigate';
    event.respondWith(networkFirst ? fromNetwork(request) : fromCache(request));
});

async function fromCache(request) {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    if (cached) {
        return cached;
    }
    const response = await fetch(request);
    if (response.ok) {
        cache.put(request, response.clone());
    }
    return response;
}

async function fromNetwork(request) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) {
            return cached;
        }
        throw error;
    }
}
