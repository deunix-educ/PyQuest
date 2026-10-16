// Effets sonores : rendu hors ligne dans Chromium (même chaîne que la lecture réelle), puis mesure
// de la crête et du niveau efficace. Définir AUDIO_DUMP_DIR pour écrire des .wav à écouter.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import assert from 'node:assert';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url).pathname;
const executablePath = process.env.CHROMIUM ?? '/usr/bin/chromium';
const port = 8128;
const skip = !existsSync(executablePath) && `navigateur absent (${executablePath})`;
const SAMPLE_RATE = 44100;

let server;
let browser;

before(async () => {
    if (skip) return;
    server = spawn('python3', [`${root}scripts/dev_server.py`, '--port', String(port)], { env: { ...process.env, PYQUEST_QUIET: '1' }, stdio: 'ignore' });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
});

after(async () => {
    await browser?.close();
    server?.kill();
});

const toDb = (value) => 20 * Math.log10(value);

function wav16(samples) {
    const buffer = Buffer.alloc(44 + samples.length * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + samples.length * 2, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(SAMPLE_RATE, 24);
    buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples.length * 2, 40);
    samples.forEach((value, index) => buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + index * 2));
    return buffer;
}

test('les effets sonores sont audibles, sans saturation', { skip, timeout: 60000 }, async () => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const rendered = await page.evaluate(async (rate) => {
        const { AudioEngine } = await import('/js/core/AudioEngine.js');
        const sounds = {};
        for (const name of AudioEngine.soundNames) {
            const context = new OfflineAudioContext(1, rate * 3, rate);
            const { input } = AudioEngine.buildOutput(context, 0.8); // volume par défaut des réglages
            const duration = AudioEngine.schedule(context, input, name, 0);
            const buffer = await context.startRendering();
            sounds[name] = Array.from(buffer.getChannelData(0).slice(0, Math.ceil(duration * rate)));
        }
        return sounds;
    }, SAMPLE_RATE);

    const dump = process.env.AUDIO_DUMP_DIR;
    if (dump) mkdirSync(dump, { recursive: true });
    for (const [name, samples] of Object.entries(rendered)) {
        const peak = Math.max(...samples.map(Math.abs));
        const active = samples.filter((value) => Math.abs(value) > 0.001);
        const rms = Math.sqrt(active.reduce((sum, value) => sum + value * value, 0) / active.length);
        console.log(`${name.padEnd(15)} durée ${(samples.length / SAMPLE_RATE).toFixed(2)} s  crête ${toDb(peak).toFixed(1)} dBFS  efficace ${toDb(rms).toFixed(1)} dBFS`);
        if (dump) writeFileSync(`${dump}/fx-${name}.wav`, wav16(samples));
        // Audible : crête au moins -8 dBFS, niveau efficace au moins -26 dBFS ; jamais de saturation.
        assert.ok(toDb(peak) >= -8, `${name} trop faible : crête ${toDb(peak).toFixed(1)} dBFS`);
        assert.ok(toDb(peak) <= -0.5, `${name} sature : crête ${toDb(peak).toFixed(1)} dBFS`);
        assert.ok(toDb(rms) >= -26, `${name} trop faible : efficace ${toDb(rms).toFixed(1)} dBFS`);
    }
});
