// Point d'entrée de l'éditeur de niveaux (mode auteur) : assemble les modules et lance l'application.

import { IndexedDbKeyValueStore, MemoryKeyValueStore } from '../core/KeyValueStores.js';
import { LessonEngine } from '../core/LessonEngine.js';
import { LevelLinter } from '../core/LevelLinter.js';
import { I18n } from '../i18n/i18n.js';
import { AuthorApp } from './AuthorApp.js';

const LANGUAGES = ['fr', 'en'];

async function loadJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Cannot load ${url}`);
    }
    return response.json();
}

const json = (path) => loadJson(new URL(path, import.meta.url));

/** Magasin IndexedDB si utilisable, sinon mémoire (les brouillons ne survivraient pas au rechargement). */
async function openStore(name) {
    try {
        const store = new IndexedDbKeyValueStore(name);
        await store.get('probe');
        return store;
    } catch {
        return new MemoryKeyValueStore();
    }
}

/** Reprend langue, thème et taille de texte choisis dans l'application (lecture seule). */
async function readLearnerSettings() {
    try {
        return (await new IndexedDbKeyValueStore('pyquest').get('settings')) ?? {};
    } catch {
        return {};
    }
}

async function main() {
    const [app, author, errors, guide, schema, settings] = await Promise.all([
        Promise.all(LANGUAGES.map((lang) => json(`../i18n/${lang}.json`))),
        Promise.all(LANGUAGES.map((lang) => json(`../i18n/author.${lang}.json`))),
        Promise.all(LANGUAGES.map((lang) => json(`../i18n/errors.${lang}.json`))),
        Promise.all(LANGUAGES.map((lang) => json(`../i18n/guide.${lang}.json`))),
        loadJson(new URL('/levels/schema/level.schema.json', location.href)),
        readLearnerSettings(),
    ]);
    const byLang = (list) => Object.fromEntries(LANGUAGES.map((lang, index) => [lang, list[index]]));
    // Un seul catalogue par langue : textes de l'application (pour l'essai) + textes de l'éditeur.
    const catalogs = Object.fromEntries(LANGUAGES.map((lang, index) => [lang, { ...app[index], ...author[index] }]));

    const root = document.documentElement;
    root.style.setProperty('--font-scale', String((settings.fontSize ?? 100) / 100));
    if (settings.theme && settings.theme !== 'auto') {
        root.setAttribute('data-theme', settings.theme);
    }
    root.dataset.guide = settings.guideEnabled === false ? 'off' : 'on';

    const i18n = new I18n(catalogs, settings.lang ?? 'fr');
    root.lang = i18n.lang;
    i18n.addEventListener('change', () => (root.lang = i18n.lang));

    await new AuthorApp({
        i18n,
        linter: new LevelLinter(schema),
        lessons: new LessonEngine({ levelsUrl: new URL('/levels/', location.href).href }),
        store: await openStore('pyquest-author'),
        catalogs: { errors: byLang(errors), guide: byLang(guide) },
        root: document.getElementById('author-root'),
    }).run();
}

main().catch((error) => {
    document.getElementById('author-root').textContent = `PyQuest: ${error.message}`;
});
