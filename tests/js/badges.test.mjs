// Chaque badge existant a son illustration et ses textes (nom, condition) en français et en anglais.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { ProgressStore } from '../../app/js/core/ProgressStore.js';
import { BADGE_ICON_IDS } from '../../app/js/ui/badgeArt.js';

const dir = new URL('../../app/js/i18n/', import.meta.url);
const catalogs = { fr: JSON.parse(readFileSync(new URL('fr.json', dir), 'utf8')), en: JSON.parse(readFileSync(new URL('en.json', dir), 'utf8')) };

assert.ok(ProgressStore.badgeIds.length >= 5);
assert.deepEqual([...BADGE_ICON_IDS].sort(), [...ProgressStore.badgeIds].sort(), 'illustration ⇔ badge');
for (const id of ProgressStore.badgeIds) {
    for (const [lang, catalog] of Object.entries(catalogs)) {
        assert.ok(catalog[`badge.${id}`]?.trim(), `${lang} : nom du badge ${id}`);
        assert.ok(catalog[`badge.${id}.desc`]?.trim(), `${lang} : condition du badge ${id}`);
    }
}
console.log('badges ok');
