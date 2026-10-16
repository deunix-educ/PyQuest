// Chaque étape narrée de chaque niveau doit avoir son fichier audio (make voice), dans les deux
// langues, à l'URL exacte que construit LevelSession ; idem pour l'échantillon des réglages.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert';
import yaml from '../../app/js/lib/js-yaml/js-yaml.mjs';
import { LevelSession } from '../../app/js/core/LevelSession.js';
import { speechKey } from '../../app/js/core/speechKey.js';

const root = new URL('../../', import.meta.url).pathname;
const base = 'http://x/levels/';
const missing = [];
let checked = 0;

for (const id of readdirSync(`${root}levels`).filter((name) => /^\d\d-/.test(name))) {
    const level = yaml.load(readFileSync(`${root}levels/${id}/level.yaml`, 'utf8'));
    for (const lang of ['fr', 'en']) {
        const session = new LevelSession(level, lang, `${base}${id}/`);
        for (let i = 0; i < session.stepCount; i++, session.next()) {
            const step = session.step;
            if (step.type !== 'explain' || !step.voice) continue;
            checked += 1;
            assert.ok(step.audioUrl.startsWith(`${base}${id}/audio/${lang}/`), step.audioUrl);
            const file = `${root}levels/${step.audioUrl.slice(base.length)}`;
            if (!existsSync(file)) missing.push(file);
        }
    }
}
for (const lang of ['fr', 'en']) {
    const sample = JSON.parse(readFileSync(`${root}app/js/i18n/${lang}.json`, 'utf8'))['voice.sample'];
    const file = `${root}app/assets/voice/${lang}/${speechKey(lang, sample)}.mp3`;
    checked += 1;
    if (!existsSync(file)) missing.push(file);
}
assert.ok(checked > 0);
assert.deepEqual(missing, [], 'narration manquante : lancer make voice');
console.log(`voice assets ok (${checked} fichiers)`);
