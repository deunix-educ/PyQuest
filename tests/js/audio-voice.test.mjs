import { AudioEngine } from '../../app/js/core/AudioEngine.js';
import { VoiceEngine } from '../../app/js/core/VoiceEngine.js';
import assert from 'node:assert';
let osc = 0;
const node = () => ({ connect: (n) => n, start() {}, stop() {}, frequency: {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } });
const ctx = { state: 'suspended', currentTime: 0, destination: {}, resume: async function () { this.state = 'running'; }, createOscillator: () => { osc++; return node(); }, createGain: node };
const a = new AudioEngine({ contextFactory: () => ctx });
assert.equal(a.play('success_small'), false);          // pas débloqué
await a.unlock();
assert.equal(a.play('success_small'), true); assert.equal(osc, 2);
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
assert.equal(new VoiceEngine({ synth: null, Utterance: undefined }).supported, false);
console.log('audio/voice ok');
