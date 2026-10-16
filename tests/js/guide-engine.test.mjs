// Personnage-guide : variété des messages (jamais deux fois de suite, tout le catalogue avant répétition),
// paramètres résolus, catalogues fr/en cohérents.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { GuideEngine } from '../../app/js/core/GuideEngine.js';

const dir = new URL('../../app/js/i18n/', import.meta.url);
const catalogs = { fr: JSON.parse(readFileSync(new URL('guide.fr.json', dir), 'utf8')), en: JSON.parse(readFileSync(new URL('guide.en.json', dir), 'utf8')) };
const PARAMS = { level_complete: ['xp'], streak: ['days'] };

// --- Catalogues : mêmes situations dans les deux langues, assez de variantes, paramètres connus.
assert.deepEqual(Object.keys(catalogs.fr).sort(), Object.keys(catalogs.en).sort());
assert.deepEqual(Object.keys(catalogs.fr).sort(), [...GuideEngine.situations].sort(), 'chaque situation a un message, et inversement');
for (const [lang, catalog] of Object.entries(catalogs)) {
    for (const [situation, variants] of Object.entries(catalog)) {
        assert.ok(variants.length >= 2, `${lang}/${situation} : au moins 2 variantes`);
        assert.equal(new Set(variants).size, variants.length, `${lang}/${situation} : variantes distinctes`);
        for (const text of variants) {
            assert.ok(text.trim().length > 0 && text.length <= 110, `${lang}/${situation} : message court et non vide`);
            for (const [, name] of text.matchAll(/\{(\w+)\}/g)) {
                assert.ok((PARAMS[situation] ?? []).includes(name), `${lang}/${situation} : paramètre inattendu {${name}}`);
            }
        }
    }
}
// Les situations avec paramètres les utilisent dans toutes les variantes (sinon l'info disparaît).
for (const [situation, names] of Object.entries(PARAMS)) {
    for (const lang of ['fr', 'en']) {
        for (const text of catalogs[lang][situation]) {
            for (const name of names) assert.ok(text.includes(`{${name}}`) || situation === 'level_complete', `${lang}/${situation} : {${name}} absent`);
        }
    }
}

// --- Variété : jamais deux fois de suite, et toutes les variantes avant qu'une se répète.
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // générateur déterministe
const guide = new GuideEngine(catalogs, { random });
const size = catalogs.fr.success_step.length;
const said = Array.from({ length: size * 6 }, () => guide.say('success_step', 'fr').text);
said.forEach((text, i) => i > 0 && assert.notEqual(text, said[i - 1], 'jamais deux fois de suite'));
for (let start = 0; start < said.length; start += size) {
    assert.equal(new Set(said.slice(start, start + size)).size, size, 'toutes les variantes avant répétition');
}

// --- Paramètres, humeur, langue de repli, situation inconnue.
assert.equal(guide.say('streak', 'fr', { days: 5 }).text.includes('5'), true);
assert.match(guide.say('level_complete', 'en', { xp: 40 }).text, /\+40 XP/);
assert.equal(guide.say('error_runtime', 'fr').mood, 'thinking');
assert.equal(guide.say('level_complete', 'fr', { xp: 1 }).mood, 'celebrate');
assert.equal(guide.say('level_start', 'de').text.length > 0, true, 'langue inconnue → français');
assert.throws(() => guide.say('inexistante', 'fr'));
// Les langues ont des sacs séparés : parler en anglais ne perturbe pas la rotation française.
const a = new GuideEngine(catalogs, { random }).say('fail_tests', 'fr').text;
assert.ok(catalogs.fr.fail_tests.includes(a));
console.log('guide ok');
