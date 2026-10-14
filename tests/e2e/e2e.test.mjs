// Parcours de bout en bout dans Chromium : niveaux 00 et 01, erreurs, interruption, persistance.
// Prérequis : make vendor-pyodide ; un Chromium installé (variable CHROMIUM, défaut /usr/bin/chromium).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { after, before, test } from 'node:test';
import assert from 'node:assert';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url).pathname;
const executablePath = process.env.CHROMIUM ?? '/usr/bin/chromium';
const port = 8125;
const base = `http://127.0.0.1:${port}/`;
const skip = !existsSync(`${root}vendor/pyodide/pyodide.mjs`) ? 'vendor/pyodide absent' : !existsSync(executablePath) ? `navigateur absent (${executablePath})` : false;

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

test('parcours complet des niveaux 00 et 01', { skip, timeout: 180000 }, async () => {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(base);
    assert.equal(await page.evaluate(() => crossOriginIsolated), true, 'page isolée (COOP/COEP)');
    await page.waitForSelector('.explain', { timeout: 60000 });

    const next = () => page.locator('.notebook-action button').last().click();
    const run = async (code) => {
        const cell = page.locator('.cell').last();
        await cell.locator('textarea').fill(code);
        await cell.locator('.btn-primary').click();
        await page.waitForFunction(() => document.querySelector('.cell:last-of-type')?.getAttribute('aria-busy') !== 'true');
        await page.waitForTimeout(150);
        return (await cell.locator('.cell-feedback').textContent()).trim();
    };

    // Niveau 00 : 4 explications puis « Je comprends ».
    for (let i = 0; i < 4; i++) await next();
    await next();
    await page.waitForSelector('.toast');
    assert.match(await page.textContent('.progress-summary'), /10 XP/);

    // Niveau 01.
    await page.locator('.level-button', { hasText: 'Ton premier programme' }).click();
    await page.waitForSelector('.explain');
    await next();
    assert.match(await run('print("Bonjour")'), /correct/);
    await next();
    assert.match(await run('print("bonjour le monde")'), /majuscules/);
    assert.match(await run('print(Bonjour)'), /Python ne connaît pas « Bonjour »/);
    assert.match(await run('print("Bonjour le monde")'), /correct/);

    // Boucle infinie interrompue, puis cellule réutilisable.
    const cell = page.locator('.cell').last();
    await cell.locator('textarea').fill('while True:\n    pass');
    await cell.locator('.btn-primary').click();
    await page.waitForTimeout(500);
    await cell.locator('.btn', { hasText: 'Arrêter' }).click();
    await page.waitForFunction(() => document.querySelector('.cell:last-of-type')?.getAttribute('aria-busy') !== 'true', null, { timeout: 15000 });
    assert.match(await cell.locator('.cell-feedback').textContent(), /Exécution arrêtée/);
    assert.match(await run('print("Bonjour le monde")'), /correct/);

    // La progression survit au rechargement (IndexedDB).
    await page.reload();
    await page.waitForSelector('.progress-map .level-button', { timeout: 60000 });
    assert.match(await page.textContent('.progress-map'), /10 XP/);

    assert.deepEqual(errors, []);
});
