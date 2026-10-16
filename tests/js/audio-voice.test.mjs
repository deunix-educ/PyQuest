import { AudioEngine } from '../../app/js/core/AudioEngine.js';
import { VoiceEngine } from '../../app/js/core/VoiceEngine.js';
import assert from 'node:assert';
let osc = 0;
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
const node = () => ({ connect: (n) => n, start() {}, stop() {}, frequency: param(), gain: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
const ctx = { state: 'suspended', currentTime: 0, destination: {}, resume: async function () { this.state = 'running'; }, createOscillator: () => { osc++; return node(); }, createGain: node, createDynamicsCompressor: node };
const a = new AudioEngine({ contextFactory: () => ctx });
assert.equal(a.play('success_small'), false);          // pas débloqué
await a.unlock();
assert.equal(a.play('success_small'), true); assert.equal(osc, 6); // 2 notes × 3 partiels
assert.equal(a.play('nope'), false);
a.setEnabled(false); assert.equal(a.play('error'), false);
a.setEnabled(true); a.setVolume(5); assert.equal(a.volume, 1);
// Voix
const spoken = [];
class U { constructor(t) { this.text = t; } }
const synth = { cancel() { spoken.push('cancel'); }, getVoices: () => [{ lang: 'en-GB' }, { lang: 'fr-CA' }, { lang: 'fr-FR' }],
    speak(u) { spoken.push(u); setTimeout(() => u.onend(), 0); } };
const v = new VoiceEngine({ synth, Utterance: U });
assert.equal(await v.speak('Utilise `print()`  ici', 'fr'), true);
const u = spoken.at(-1); assert.equal(u.text, 'Utilise print() ici'); assert.equal(u.voice.lang, 'fr-FR'); assert.equal(u.lang, 'fr-FR');
v.setRate(9); assert.equal(v.rate, 2);
v.setEnabled(false); assert.equal(await v.speak('x'), false);
assert.equal(new VoiceEngine({ synth: null, Utterance: undefined, AudioClass: undefined }).supported, false);

// Narration par fichier pré-généré, avec repli sur la voix système si le fichier manque.
globalThis.URL.createObjectURL = () => 'blob:fake';
globalThis.URL.revokeObjectURL = () => {};
const played = [];
class FakeAudio {
    constructor(src) { this.src = src; played.push(this); }
    play() { queueMicrotask(() => { this.onplaying?.(); this.onended?.(); }); return Promise.resolve(); }
    pause() {}
}
const spoken2 = [];
const synth2 = { cancel() {}, getVoices: () => [], speak(u) { spoken2.push(u.text); setTimeout(() => u.onend(), 0); } };
const files = { ok: true };
const fetchFn = async (url) => (url.endsWith('/there.mp3') ? { ok: true, blob: async () => new Blob(['x']) } : { ok: false });
const v2 = new VoiceEngine({ synth: synth2, Utterance: U, AudioClass: FakeAudio, fetchFn });
assert.equal(await v2.speak('Texte', 'fr', { audioUrl: '/a/there.mp3' }), true);
assert.equal(played.length, 1); assert.deepEqual(spoken2, []);          // fichier lu, pas de voix système
assert.equal(await v2.speak('Repli `x`', 'fr', { audioUrl: '/a/absent.mp3' }), true);
assert.equal(played.length, 1); assert.deepEqual(spoken2, ['Repli x']); // fichier absent : repli
v2.setRate(1.5); assert.equal(v2.rate, 1.5);
const noAudioNoSynth = new VoiceEngine({ synth: null, Utterance: undefined, AudioClass: undefined });
assert.equal(noAudioNoSynth.supported, false);
console.log('audio/voice ok');
