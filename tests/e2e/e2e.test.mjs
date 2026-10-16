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

// Ouvre un niveau depuis le tiroir « Niveaux » (le tiroir se referme après le choix).
async function openLevelFromDrawer(page, title) {
    await page.locator('#levels-toggle').click();
    await page.locator('.level-button', { hasText: title }).click();
    await page.locator('.drawer-left.is-open').waitFor({ state: 'detached', timeout: 100 }).catch(() => {});
}

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
        await cell.locator('.cell-run').click();
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
    await openLevelFromDrawer(page, 'Ton premier programme');
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
    await cell.locator('.cell-run').click();
    await page.waitForTimeout(500);
    await cell.locator('.btn', { hasText: 'Arrêter' }).click();
    await page.waitForFunction(() => document.querySelector('.cell:last-of-type')?.getAttribute('aria-busy') !== 'true', null, { timeout: 15000 });
    assert.match(await cell.locator('.cell-feedback').textContent(), /Exécution arrêtée/);
    assert.match(await run('print("Bonjour le monde")'), /correct/);

    // La progression survit au rechargement (IndexedDB).
    await page.reload();
    await page.waitForSelector('.progress-map .level-button', { state: 'attached', timeout: 60000 });
    assert.match(await page.textContent('.progress-map'), /10 XP/);

    assert.deepEqual(errors, []);
});

test('niveau 03 : saisie interactive et validation par rejeu scripté', { skip, timeout: 180000 }, async () => {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.waitForSelector('.progress-map .level-button', { state: 'attached', timeout: 60000 });
    await openLevelFromDrawer(page, 'Demander à l\'utilisateur');
    await page.waitForSelector('.explain');

    const next = () => page.locator('.notebook-action button').last().click();
    const idle = () => page.waitForFunction(() => document.querySelector('.cell:last-of-type')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
    // Lance le code puis répond aux input() dans l'ordre ; renvoie sortie et retour de validation.
    const run = async (code, answers = []) => {
        const cell = page.locator('.cell').last();
        await cell.locator('textarea').fill(code);
        await cell.locator('.cell-run').click();
        for (const answer of answers) {
            await cell.locator('.cell-input-field').waitFor({ state: 'visible', timeout: 15000 });
            await cell.locator('.cell-input-field').fill(answer);
            await cell.locator('.cell-input-field').press('Enter');
        }
        await idle();
        await page.waitForTimeout(150);
        return {
            output: await cell.locator('.cell-output').textContent(),
            feedback: (await cell.locator('.cell-feedback').textContent()).trim(),
        };
    };

    await next();
    let result = await run('name = input("Ton prénom ? ")\nprint("Bonjour", name)', ['Zoé']);
    assert.equal(result.output, 'Ton prénom ? Bonjour Zoé\n'.replace('Bonjour', 'Zoé\nBonjour'));
    assert.match(result.feedback, /correct/);

    await next();
    await next();
    result = await run('text = input("Un nombre entier ? ")\nnumber = text\nprint(number * 2)', ['21']);
    assert.match(result.output, /2121/);
    assert.match(result.feedback, /Pas encore/);
    result = await run('text = input("Un nombre entier ? ")\nnumber = int(text)\nprint(number * 2)', ['21']);
    assert.match(result.feedback, /correct/);

    // Une saisie en attente peut être abandonnée avec « Arrêter ».
    const cell = page.locator('.cell').last();
    await cell.locator('textarea').fill('input("?")');
    await cell.locator('.cell-run').click();
    await cell.locator('.cell-input-field').waitFor({ state: 'visible' });
    await cell.locator('.btn', { hasText: 'Arrêter' }).click();
    await idle();
    assert.match(await cell.locator('.cell-feedback').textContent(), /Exécution arrêtée/);
    assert.equal(await cell.locator('.cell-input-field').isVisible(), false);

    // Étape float, puis mission avec plusieurs rejeux scriptés (2010 -> 15, 2000 -> 25).
    await next();
    await next();
    result = await run('text = input("Un prix ? ")\nprice = float(text)\nprint(price + 0.5)', ['2.5']);
    assert.match(result.feedback, /correct/);
    await next();
    result = await run('current_year = 2025\nyear = int(input("Année ? "))\nage = current_year - year\nprint(age)', ['2010']);
    assert.match(result.feedback, /correct/);
    await page.waitForSelector('.toast');
    assert.match(await page.textContent('.toast-region'), /\+40 XP/);

    assert.deepEqual(errors, []);
});

test('narration : fichier Piper lu jusqu\'au bout (politique autoplay par défaut), réglage immédiat', { skip, timeout: 120000 }, async () => {
    // Pas d'option d'autoplay : on reproduit le comportement d'un navigateur ordinaire.
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const served = [];
    page.on('response', (response) => {
        if (response.url().endsWith('.mp3')) served.push(`${response.status()} ${response.headers()['content-type']}`);
    });
    // Espionne les lectures pour savoir si un fichier est allé jusqu'à la fin.
    await page.addInitScript(() => {
        window.__audio = { ended: 0, errors: 0 };
        const Original = window.Audio;
        window.Audio = class extends Original {
            constructor(...args) {
                super(...args);
                this.addEventListener('ended', () => {
                    if (this.src.startsWith('blob:')) window.__audio.ended += 1; // ignore le silence d'amorçage
                });
                this.addEventListener('error', () => (window.__audio.errors += 1));
            }
        };
    });
    await page.goto(base);
    await page.waitForSelector('.explain', { timeout: 60000 });

    // La voix est activée par défaut : le bouton est là dès la première étape, sans rechargement.
    const listen = page.locator('.explain .voice-button').first();
    await listen.waitFor({ state: 'visible' });
    await listen.click();
    await page.waitForFunction(() => window.__audio.ended >= 1, null, { timeout: 30000 });

    // Désactiver la voix masque immédiatement le bouton déjà affiché ; la réactiver le ramène.
    await page.locator('#settings-toggle').click();
    const voiceSetting = page.getByLabel('Voix', { exact: true });
    await voiceSetting.uncheck();
    await listen.waitFor({ state: 'hidden' });
    await voiceSetting.check();
    await listen.waitFor({ state: 'visible' });

    // Échantillon des réglages.
    const before = await page.evaluate(() => window.__audio.ended);
    await page.locator('.settings').getByRole('button', { name: 'Tester la voix' }).click();
    await page.waitForFunction((count) => window.__audio.ended > count, before, { timeout: 30000 });

    // Une lecture menée à son terme ne doit jamais afficher le message d'échec.
    assert.doesNotMatch(await page.textContent('.toast-region'), /Impossible de lire/);
    assert.ok(served.length >= 2 && served.every((entry) => entry.startsWith('200 audio/mpeg')), `mp3 servis : ${served}`);
    assert.equal(await page.evaluate(() => window.__audio.errors), 0);
    assert.deepEqual(errors, []);
});

test('niveau 07 : boucle while avec plusieurs saisies successives dans l\'interface', { skip, timeout: 120000 }, async () => {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.waitForSelector('.progress-map .level-button', { state: 'attached', timeout: 60000 });
    await openLevelFromDrawer(page, 'Répéter avec une condition');
    await page.waitForSelector('.explain');

    const next = () => page.locator('.notebook-action button').last().click();
    // Passe les étapes jusqu'à la mission (explications seulement : on saute les exercices en les validant).
    const solveStep = async (code, answers = []) => {
        const cell = page.locator('.cell').last();
        await cell.locator('textarea').fill(code);
        await cell.locator('.cell-run').click();
        for (const answer of answers) {
            await cell.locator('.cell-input-field').waitFor({ state: 'visible', timeout: 15000 });
            await cell.locator('.cell-input-field').fill(answer);
            await cell.locator('.cell-input-field').press('Enter');
        }
        await page.waitForFunction(() => document.querySelector('.cell:last-of-type')?.getAttribute('aria-busy') !== 'true');
        await page.waitForTimeout(150);
        return (await cell.locator('.cell-feedback').textContent()).trim();
    };

    await next();
    assert.match(await solveStep('count = 5\nwhile count > 0:\n    print(count)\n    count = count - 1\nprint("Partez !")'), /correct/);
    await next();
    await next();
    assert.match(await solveStep('total = 0\nnumber = 1\nwhile total < 50:\n    total = total + number\n    number = number + 1\nprint(total, number)'), /correct/);
    await next();
    await next();
    const password = 'while True:\n    word = input("Mot de passe ? ")\n    if word == "python":\n        break\n    else:\n        print("Essaie encore")\nprint("Bienvenue")';
    assert.match(await solveStep(password, ['nope', 'python']), /correct/);
    await next();
    await next();

    // Mission : trois saisies interactives successives (3, 9, 7) dans la même exécution.
    const mission = 'secret = 7\nattempts = 0\nwhile True:\n    guess = int(input("Ton choix (1-10) ? "))\n    attempts = attempts + 1\n    if guess == secret:\n        print("Bravo, trouvé en", attempts, "essais")\n        break\n    elif guess < secret:\n        print("Trop petit")\n    else:\n        print("Trop grand")';
    assert.match(await solveStep(mission, ['3', '9', '7']), /correct/);
    await page.waitForSelector('.toast');
    assert.match(await page.textContent('.toast-region'), /\+70 XP/);
    assert.deepEqual(errors, []);
});

test('navigation : lien direct vers un niveau, tiroirs accessibles, précédent/suivant', { skip, timeout: 120000 }, async () => {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // Lien direct vers le niveau 05.
    await page.goto(`${base}#/levels/05-decide`);
    await page.waitForSelector('.explain', { timeout: 60000 });
    assert.match(await page.textContent('#level-current'), /Niveau 6 sur 8 · Décider/);
    assert.match(await page.textContent('.notebook-status'), /Étape 1 sur/);

    // Précédent / suivant changent de niveau et l'URL ; le bouton retour du navigateur revient.
    await page.locator('#level-next').click();
    await page.waitForFunction(() => document.querySelector('#level-current').textContent.includes('Niveau 7 sur 8'));
    assert.equal(new URL(page.url()).hash, '#/levels/06-lists');
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#level-current').textContent.includes('Niveau 6 sur 8'));

    // Tiroir « Niveaux » : le reste de la page devient inerte, Échap ferme et rend le focus au bouton.
    const toggle = page.locator('#levels-toggle');
    await toggle.click();
    await page.locator('.drawer-left.is-open').waitFor();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#app-root').getAttribute('inert'), '');
    assert.match(await page.textContent('.drawer-left .drawer-title'), /Ta progression/);
    assert.match(await page.textContent('.progress-count'), /0 niveau\(x\) terminé\(s\) sur 8/);
    await page.keyboard.press('Escape');
    await page.locator('.drawer-left.is-open').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#app-root').getAttribute('inert'), null);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'levels-toggle');

    // Tiroir « Réglages » : le focus reste piégé à l'intérieur.
    await page.locator('#settings-toggle').click();
    await page.locator('.drawer-right.is-open').waitFor();
    for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('.drawer-right'))), true, 'focus piégé');
    await page.locator('.drawer-right .drawer-close').click();
    await page.locator('.drawer-right.is-open').waitFor({ state: 'hidden' });

    // Choisir un niveau dans le tiroir le ferme et l'ouvre.
    await openLevelFromDrawer(page, 'Calculer');
    await page.waitForFunction(() => document.querySelector('#level-current').textContent.includes('Niveau 5 sur 8'));
    assert.equal(await page.locator('.drawer-left.is-open').count(), 0);
    assert.deepEqual(errors, []);
});

test('éditeur : coloration syntaxique, textarea réel, polices de la charte', { skip, timeout: 120000 }, async () => {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}#/levels/06-lists`);
    await page.waitForSelector('.explain', { timeout: 60000 });
    await page.locator('.notebook-action button').click();
    const textarea = page.locator('.cell textarea');
    await textarea.waitFor();

    // Le contrôle reste un vrai textarea accessible ; la coloration est décorative (aria-hidden).
    assert.equal(await page.locator('.code-highlight').getAttribute('aria-hidden'), 'true');
    assert.equal(await textarea.getAttribute('aria-label'), 'Éditeur de code Python');
    await textarea.fill('for n in range(3):\n    print("a", n)  # fin');
    await page.waitForFunction(() => document.querySelectorAll('.code-highlight .tok-keyword').length === 2);
    assert.equal(await page.locator('.code-highlight .tok-string').textContent(), '"a"');
    assert.equal(await page.locator('.code-highlight .tok-comment').textContent(), '# fin');

    // Charte : polices auto-hébergées effectivement chargées, sans ligature.
    const fonts = await page.evaluate(async () => {
        await document.fonts.ready;
        return {
            ui: document.fonts.check('16px "Atkinson Hyperlegible"'),
            code: document.fonts.check('16px "JetBrains Mono"'),
            ligatures: getComputedStyle(document.querySelector('.code-editor')).fontVariantLigatures,
        };
    });
    assert.deepEqual(fonts, { ui: true, code: true, ligatures: 'none' });
    assert.deepEqual(errors, []);
});
