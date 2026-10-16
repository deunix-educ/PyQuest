// Les textes de l'éditeur de niveaux : toutes les clés utilisées dans le code existent en français et en
// anglais, chaque code de vérification (linter, vérification d'exécution) a son message, et les deux
// catalogues sont strictement parallèles (mêmes clés, mêmes paramètres).
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert';
import { PYTHON_TYPES, TEST_KINDS } from '../../app/js/author/LevelDraft.js';

const root = new URL('../../', import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, 'utf8');
const catalogs = {
    fr: { ...JSON.parse(read('app/js/i18n/fr.json')), ...JSON.parse(read('app/js/i18n/author.fr.json')) },
    en: { ...JSON.parse(read('app/js/i18n/en.json')), ...JSON.parse(read('app/js/i18n/author.en.json')) },
};
const author = { fr: JSON.parse(read('app/js/i18n/author.fr.json')), en: JSON.parse(read('app/js/i18n/author.en.json')) };

// Parallélisme strict.
assert.deepEqual(Object.keys(author.fr).sort(), Object.keys(author.en).sort());
const params = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const key of Object.keys(author.fr)) assert.equal(params(author.fr[key]), params(author.en[key]), `paramètres de ${key}`);

// Clés littérales utilisées dans le code de l'éditeur.
const sources = readdirSync(`${root}app/js/author`).filter((name) => name.endsWith('.js')).map((name) => read(`app/js/author/${name}`));
const used = new Set(sources.flatMap((source) => [...source.matchAll(/\bt\('([\w.]+)'/g)].map((m) => m[1])));
// Clés construites dynamiquement.
for (const kind of Object.keys(TEST_KINDS)) ['', '.help'].forEach((suffix) => used.add(`author.kind.${kind}${suffix}`));
for (const type of ['explain', 'code']) used.add(`author.step.type.${type}`);
for (const severity of ['error', 'warning', 'info']) used.add(`author.severity.${severity}`);
for (let n = 1; n <= 5; n++) used.add(`author.export.step${n}`);
for (const lang of ['fr', 'en']) for (const key of used) assert.ok(catalogs[lang][key]?.trim(), `${lang} : clé ${key} manquante`);

// Un message par code de problème émis par le linter ou le vérificateur.
const emitted = new Set(['core/LevelLinter.js', 'core/LevelChecker.js'].flatMap((file) => [...read(`app/js/${file}`).matchAll(/add\('(?:error|warning|info)', '([a-z_]+)'/g)].map((m) => m[1])));
assert.ok(emitted.size >= 20, `codes détectés : ${emitted.size}`);
for (const lang of ['fr', 'en']) for (const code of emitted) assert.ok(catalogs[lang][`lint.${code}`], `${lang} : message lint.${code} manquant`);

// Pas de message orphelin : chaque lint.* correspond à un code réellement émis.
for (const key of Object.keys(author.fr).filter((k) => k.startsWith('lint.'))) assert.ok(emitted.has(key.slice(5)), `message orphelin ${key}`);
assert.ok(PYTHON_TYPES.length > 0);
console.log('author i18n ok');
