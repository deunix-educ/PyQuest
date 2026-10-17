// Service worker : app shell hors ligne.
// - Coquille de l'app : pré-cachée à l'installation.
// - Pyodide vendorisé, niveaux, scripts : mis en cache à la première utilisation (hors ligne ensuite).
// Les en-têtes COOP/COEP du document viennent du serveur ; ce worker ne les fabrique pas.

const CACHE_VERSION = 'pyquest-v5';
// Caches à longue durée de vie : leur nom ne change pas à chaque déploiement.
// - narration Piper : fichiers nommés d'après leur contenu, donc jamais périmés ; les télécharger une fois suffit
//   (page : OfflineVoices) et ils survivent aux mises à jour de l'application ;
// - Pyodide : versionné (le nom du cache change seulement si la version de Pyodide change, voir scripts/build.py).
const AUDIO_CACHE = 'pyquest-audio';
const PYODIDE_CACHE = 'pyquest-pyodide-dev';

const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/themes.css', 'css/base.css', 'css/cells.css', 'css/guide.css', 'css/progress.css', 'icons/icon.svg', 'js/main.js'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => ![CACHE_VERSION, AUDIO_CACHE, PYODIDE_CACHE].includes(key)).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }
    // L'éditeur de niveaux peut être protégé par une connexion (redirection vers une page de login) : on le laisse
    // au navigateur, sans pré-cache ni mise en cache, pour ne jamais conserver une page de connexion à sa place.
    if (isAuthorTool(url.pathname)) {
        return;
    }
    // Pyodide (versionné, immuable, lourd) et narration (nommée d'après son contenu) : cache d'abord, dans leurs
    // caches durables. Tout le reste (code, niveaux) : réseau d'abord, cache en repli hors ligne — jamais de code
    // périmé servi en ligne.
    if (url.pathname.startsWith('/vendor/pyodide/')) {
        event.respondWith(fromCache(request, PYODIDE_CACHE));
    } else if (isNarration(url.pathname)) {
        event.respondWith(fromCache(request, AUDIO_CACHE));
    } else {
        event.respondWith(fromNetwork(request));
    }
});

function isNarration(pathname) {
    return /^\/levels\/[^/]+\/audio\/[a-z]+\/[0-9a-f]+\.mp3$/.test(pathname) || /^\/assets\/voice\/[a-z]+\/[0-9a-f]+\.mp3$/.test(pathname);
}

function isAuthorTool(pathname) {
    // /docs/ : documentation en ligne, éventuellement protégée par connexion, hors application (jamais mise en cache).
    return pathname.startsWith('/docs/') || pathname === '/docs' || pathname === '/author.html' || pathname === '/css/author.css' || pathname.startsWith('/js/author/') || /^\/js\/i18n\/author\.[a-z]+\.json$/.test(pathname);
}

async function fromCache(request, cacheName) {
    const cache = await caches.open(cacheName);
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
        if (response.ok && !response.redirected) {
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
