import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('la licence servie par l\'application est celle du dépôt', () => {
    assert.equal(read('app/LICENSE.txt'), read('LICENSE'));
    assert.match(read('LICENSE'), /MIT License/);
});

test('le texte « À propos » existe en français et en anglais, avec les mêmes clés', () => {
    const fr = JSON.parse(read('app/js/i18n/fr.json'));
    const en = JSON.parse(read('app/js/i18n/en.json'));
    const aboutKeys = (catalog) => Object.keys(catalog).filter((key) => /^(about|footer)\.|^app\.(tagline|docTitle)$/.test(key)).sort();
    assert.deepEqual(aboutKeys(en), aboutKeys(fr));
    assert.ok(aboutKeys(fr).length > 25);
    // L'attribution exigée par la licence CC BY 4.0 de la voix française figure dans les deux langues.
    for (const catalog of [fr, en]) {
        assert.match(catalog['about.credits.cc'], /SIWIS/);
        assert.match(catalog['about.credits.cc'], /CC BY 4\.0/);
    }
});

test('chaque crédit a un rôle traduit et le contact est celui du projet', async () => {
    const source = read('app/js/ui/AboutPanel.js');
    const fr = JSON.parse(read('app/js/i18n/fr.json'));
    const en = JSON.parse(read('app/js/i18n/en.json'));
    const roles = [...source.matchAll(/role: '([^']+)'/g)].map((match) => match[1]);
    assert.ok(roles.length >= 8);
    for (const role of roles) {
        assert.ok(fr[role] && en[role], `rôle sans traduction : ${role}`);
    }
    assert.match(source, /CONTACT_EMAIL = 'dd@linuxtarn\.org'/);
    assert.match(read('app/index.html'), /mailto:dd@linuxtarn\.org/);
});
