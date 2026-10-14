import { LessonEngine } from '../../app/js/core/LessonEngine.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert';
const root = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const e = new LessonEngine({ levelsUrl: 'http://x/levels/', fetchFn: async (u) => {
    try { const t = await readFile(root + new URL(u).pathname, 'utf8'); return { ok: true, text: async () => t }; }
    catch { return { ok: false, status: 404 }; } } });
assert.deepEqual((await e.listLevels()).map((l) => l.id), ['00-intro', '01-hello', '02-variables']);
const s = await e.startLevel('02-variables', 'en');
assert.equal(s.title, 'Variables and types'); assert.equal(s.stepCount, 7);
assert.equal(s.step.type, 'explain');
while (s.next()); assert.ok(s.onMission); assert.equal(s.mission.tests[0].message, 'tip must equal bill * rate.');
const f = await e.startLevel('01-hello', 'fr'); f.next(); f.next(); assert.deepEqual(f.step.hints.length, 2);
await assert.rejects(e.loadLevel('99-nope'));
console.log('lesson ok');
