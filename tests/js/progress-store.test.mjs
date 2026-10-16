import { ProgressStore } from '../../app/js/core/ProgressStore.js';
import { MemoryKeyValueStore } from '../../app/js/core/KeyValueStores.js';
import assert from 'node:assert';
const d = (s) => new Date(s + 'T10:00:00');
const kv = new MemoryKeyValueStore();
const p = new ProgressStore(kv); await p.load();
let r = await p.completeLevel('00-intro', 10, d('2026-10-14'));
assert.deepEqual([r.xpGained, r.newBadges, r.streak.current], [10, ['first_level'], 1]);
r = await p.completeLevel('00-intro', 10, d('2026-10-14'));
assert.deepEqual([r.xpGained, r.alreadyCompleted], [0, true]);
r = await p.completeLevel('01-hello', 20, d('2026-10-15'));
assert.equal(r.streak.current, 2);
r = await p.completeLevel('02-variables', 70, d('2026-10-17')); // jour manqué
assert.deepEqual([r.streak.current, r.streak.best, r.newBadges.sort()], [1, 2, ['three_levels', 'xp_100']]);
assert.equal(p.snapshot().xp, 100);
// Persistance + export/import
const p2 = new ProgressStore(kv); assert.equal((await p2.load()).xp, 100);
const other = new ProgressStore(new MemoryKeyValueStore()); await other.load();
await other.completeLevel('05-decide', 40, d('2026-10-20'));
const merged = await p2.import(other.export());
assert.equal(merged.xp, 140); assert.equal(Object.keys(merged.completedLevels).length, 4);
assert.equal(merged.streak.lastDay, '2026-10-20');
await assert.rejects(p2.import('{"version":99}'));
await assert.rejects(new ProgressStore(kv).completeLevel('x', 1));
assert.equal(merged.addedLevels, 1);
// Fichier hostile ou corrompu : rejeté sans toucher à l'état
const good = JSON.parse(other.export());
const bad = [
    { ...good, completedLevels: { x: { xp: 'beaucoup', completedAt: 'a' } } },
    { ...good, completedLevels: { x: { xp: -5, completedAt: 'a' } } },
    { ...good, completedLevels: { x: { xp: 1e12, completedAt: 'a' } } },
    { ...good, completedLevels: JSON.parse('{"__proto__": {"xp": 1, "completedAt": "a"}}') },
    { ...good, completedLevels: { '../etc': { xp: 1, completedAt: 'a' } } },
    { ...good, badges: [] },
    { ...good, streak: { current: 'x', best: 1, lastDay: null } },
    [],
    null,
];
const xpBefore = p2.snapshot().xp;
for (const candidate of bad) {
    await assert.rejects(p2.import(JSON.stringify(candidate)));
}
assert.equal(p2.snapshot().xp, xpBefore);
assert.equal(({}).xp, undefined);
// Un changement persisté est signalé (utilisé par la synchronisation)
let changes = 0;
p2.addEventListener('change', () => (changes += 1));
await p2.recordActivity(d('2026-10-21'));
assert.equal(changes, 1);
console.log('progress ok');
