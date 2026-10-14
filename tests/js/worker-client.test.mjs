import { PyodideWorkerClient } from '../../app/js/core/PyodideWorkerClient.js';
import assert from 'node:assert';
let spawned = 0;
globalThis.Worker = class {
    constructor() { spawned++; this.l = {}; this.mode = spawned; }
    addEventListener(t, f) { this.l[t] = f; }
    terminate() { this.dead = true; }
    postMessage(m) {
        const r = (d) => queueMicrotask(() => !this.dead && this.l.message({ data: d }));
        if (m.type === 'init') r({ type: 'ready', interruptible: false });
        if (m.type === 'run_code' && m.code === 'ok') { r({ type: 'stdout', id: m.id, text: 'hi\n' }); r({ type: 'result', id: m.id, ok: true, error: null, variables: {} }); }
    }
};
const c = new PyodideWorkerClient({ indexURL: '/v/', workerUrl: 'x' });
let out = '';
const res = await c.run('ok', { onStdout: (t) => (out += t) });
assert.equal(out, 'hi\n'); assert.equal(res.ok, true); assert.equal(res.type, undefined);
const hang = c.run('loop');
await new Promise((r) => setTimeout(r, 0));
c.interrupt();
const h = await hang;
assert.equal(h.error.type, 'KeyboardInterrupt');
assert.equal(spawned, 2);
assert.equal((await c.run('ok')).ok, true);
c.dispose();
console.log('client ok');
