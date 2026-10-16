// Parcours de bout en bout dans Chromium : niveaux 00 et 01, erreurs, interruption, persistance.
// Prérequis : make vendor-pyodide ; un Chromium installé (variable CHROMIUM, défaut /usr/bin/chromium).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { after, before, test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
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
    assert.match(await page.textContent('#level-current'), /Niveau 6 sur \d+ · Décider/);
    assert.match(await page.textContent('.notebook-status'), /Étape 1 sur/);

    // Précédent / suivant changent de niveau et l'URL ; le bouton retour du navigateur revient.
    await page.locator('#level-next').click();
    await page.waitForFunction(() => document.querySelector('#level-current').textContent.includes('Niveau 7 sur '));
    assert.equal(new URL(page.url()).hash, '#/levels/06-lists');
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#level-current').textContent.includes('Niveau 6 sur '));

    // Tiroir « Niveaux » : le reste de la page devient inerte, Échap ferme et rend le focus au bouton.
    const toggle = page.locator('#levels-toggle');
    await toggle.click();
    await page.locator('.drawer-left.is-open').waitFor();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#app-root').getAttribute('inert'), '');
    assert.match(await page.textContent('.drawer-left .drawer-title'), /Ta progression/);
    assert.match(await page.textContent('.progress-count'), /0 niveau\(x\) terminé\(s\) sur \d+/);
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
    await page.waitForFunction(() => document.querySelector('#level-current').textContent.includes('Niveau 5 sur '));
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

test('personnage-guide : messages variés selon la situation, réglage pour le masquer', { skip, timeout: 120000 }, async () => {
    const guideFr = JSON.parse(readFileSync(`${root}app/js/i18n/guide.fr.json`, 'utf8'));
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}#/levels/01-hello`);
    await page.waitForSelector('.explain', { timeout: 60000 });

    // Accueil du niveau : une bulle du guide, issue du catalogue.
    const greeting = await page.locator('.notebook > .guide-bubble .guide-text').first().textContent();
    assert.ok(guideFr.level_start.includes(greeting), `accueil : ${greeting}`);
    assert.equal(await page.locator('.notebook > .guide-bubble').first().getAttribute('data-mood'), 'happy');

    await page.locator('.notebook-action button').last().click(); // 1re explication -> exercice « exécuter »
    await page.locator('.cell').waitFor();
    // Deuxième exercice, qui a des indices : « Bonjour le monde » attendu.
    await page.locator('.cell-run').click();
    await page.waitForFunction(() => document.querySelector('.cell-feedback')?.textContent.includes('correct'));
    await page.locator('.notebook-action button').last().click();
    const cell = page.locator('.cell').last();
    const guide = cell.locator('.cell-guide .guide-text');
    const run = async (code) => {
        await cell.locator('textarea').fill(code);
        await cell.locator('.cell-run').click();
        await page.waitForFunction(() => document.querySelector('.cell:last-of-type')?.getAttribute('aria-busy') !== 'true');
        await page.waitForTimeout(150);
        return guide.textContent();
    };

    // Premier échec de sortie, puis erreur Python, puis nouvel échec : messages adaptés et différents.
    const first = await run('print("bonjour le monde")');
    assert.ok(guideFr.fail_tests.includes(first), `échec 1 : ${first}`);
    assert.equal(await cell.locator('.cell-guide .guide-bubble').getAttribute('data-mood'), 'thinking');
    // Deux échecs d'affilée avec des indices disponibles : le guide suggère un indice.
    const second = await run('print(Bonjour)');
    assert.ok(guideFr.suggest_hint.includes(second), `suggestion d'indice : ${second}`);
    // Un indice révélé : encouragement dédié.
    await cell.getByRole('button', { name: /Indice/ }).click();
    assert.ok(guideFr.hint_revealed.includes(await guide.textContent()));
    // Réussite après plusieurs essais.
    const success = await run('print("Bonjour le monde")');
    assert.ok(guideFr.success_after_retry.includes(success), `réussite après essais : ${success}`);
    assert.equal(await cell.locator('.cell-guide .guide-bubble').getAttribute('data-mood'), 'celebrate');

    // Le réglage masque le guide (CSS) sans casser le reste, et le réaffiche.
    await page.locator('#settings-toggle').click();
    const setting = page.getByLabel('Personnage-guide', { exact: true });
    await setting.uncheck();
    await cell.locator('.cell-guide .guide-bubble').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.guide), 'off');
    await setting.check();
    await cell.locator('.cell-guide .guide-bubble').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
});

test('carte de progression et badges : états en texte, badge obtenu à la fin du niveau 00', { skip, timeout: 120000 }, async () => {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.waitForSelector('.explain', { timeout: 60000 });

    // Avant toute progression : tous les badges sont à débloquer, le niveau 1 est « En cours ».
    await page.locator('#levels-toggle').click();
    assert.match(await page.textContent('.badge-count'), /0 badge\(s\) obtenu\(s\) sur 5/);
    assert.equal(await page.locator('.badge-item.is-locked').count(), 5);
    const first = page.locator('.level-button').first();
    assert.equal(await first.getAttribute('aria-current'), 'step');
    assert.match(await first.textContent(), /Niveau 1 : .*Qu'est-ce qu'un programme \?.*En cours/s);
    await page.keyboard.press('Escape');

    // Termine le niveau 00.
    for (let i = 0; i < 5; i++) await page.locator('.notebook-action button').last().click();
    await page.waitForSelector('.toast');
    assert.match(await page.textContent('.toast-region'), /Badge obtenu : Premier pas/);
    assert.equal(await page.locator('.toast-badge svg.is-earned').count(), 1, 'médaille dans la notification');

    // La carte montre le niveau 1 terminé (✔ + texte) et le badge est sur l'étagère, daté.
    await page.locator('#levels-toggle').click();
    const done = page.locator('.level-button.is-done').first();
    assert.match(await done.textContent(), /Terminé/);
    assert.match(await done.locator('.node-badge').textContent(), /✔/);
    assert.match(await page.textContent('.badge-count'), /1 badge\(s\) obtenu\(s\) sur 5/);
    assert.equal(await page.locator('.badge-item.is-earned').count(), 1);
    assert.match(await page.locator('.badge-item.is-earned').textContent(), /Premier pas.*Terminer ton premier niveau.*Obtenu le/s);
    assert.equal(await page.locator('.badge-item.is-locked .badge-status').first().textContent(), 'À débloquer');
    assert.deepEqual(errors, []);
});

test('éditeur de niveaux (mode auteur) : écrire un niveau, le vérifier, l\'essayer, l\'exporter', { skip, timeout: 240000 }, async () => {
    const { spawnSync } = await import('node:child_process');
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const field = (path) => page.locator(`[data-path="${path}"]`);
    const fill = async (path, value) => field(path).fill(value);

    await page.goto(`${base}author.html`);
    await page.waitForSelector('.level-form', { timeout: 60000 });
    // Niveau vide : des erreurs sont déjà signalées, avec un bouton pour aller au champ.
    assert.match(await page.textContent('.problems-summary'), /[1-9]\d* erreur/);

    // Informations + une explication + un exercice de code + la mission.
    await fill('id', '99-essai');
    await fill('title.fr', 'Essai');
    await fill('title.en', 'Test');
    await page.getByRole('button', { name: 'Ajouter une explication' }).click();
    await fill('steps.0.text.fr', 'Voici `print()`.');
    await fill('steps.0.text.en', 'Here is `print()`.');
    await page.getByRole('button', { name: 'Ajouter un exercice de code' }).click();
    await fill('steps.1.instruction.fr', 'Affiche b.');
    await fill('steps.1.instruction.en', 'Print b.');
    await fill('steps.1.starter', 'print("a")');
    await fill('steps.1.tests.0.value', 'b\n');
    await fill('steps.1.hints.fr', 'Change la lettre.');
    await fill('steps.1.hints.en', 'Change the letter.');
    await fill('steps.1.solution', 'print("b")');
    await fill('mission.title.fr', 'Fin');
    await fill('mission.title.en', 'End');
    await fill('mission.goal.fr', 'Bravo.');
    await fill('mission.goal.en', 'Well done.');
    await page.waitForFunction(() => document.querySelector('.problems-summary')?.textContent.startsWith('0 erreur'), null, { timeout: 5000 });

    // Exécution avec le vrai Python : la solution passe, le départ échoue → tout est correct.
    await page.locator('#author-check').click();
    await page.waitForFunction(() => /exercice\(s\) sont corrects/.test(document.querySelector('#author-check + p')?.textContent ?? ''), null, { timeout: 60000 });

    // Une solution fausse est détectée, avec le bon message.
    await fill('steps.1.solution', 'print("z")');
    await page.locator('#author-check').click();
    await page.waitForSelector('.problem-error');
    assert.match(await page.textContent('.problem-error'), /La solution ne passe pas ses tests/);
    await page.locator('.problem-error button', { hasText: 'Aller au champ' }).click();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.path), 'steps.1.solution');
    await fill('steps.1.solution', 'print("b")');

    // Essai comme apprenant dans l'interface réelle.
    await page.locator('#author-preview').click();
    await page.waitForSelector('.preview-frame .explain', { timeout: 60000 });
    assert.match(await page.textContent('.preview-frame .explain'), /Voici print\(\)/);

    // Export : le fichier téléchargé est accepté par le validateur Python de la CI.
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#author-download').click()]);
    const dir = mkdtempSync(join(tmpdir(), 'pyquest-author-'));
    const file = join(dir, 'level.yaml');
    await download.saveAs(file);
    assert.equal(download.suggestedFilename(), 'level.yaml');
    const python = existsSync(`${root}.venv/bin/python`) ? `${root}.venv/bin/python` : null;
    if (python) {
        const result = spawnSync(python, [`${root}scripts/validate_levels.py`, '--file', file], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /^OK/);
    }
    writeFileSync(join(dir, 'unused'), '');

    // Brouillon restauré après rechargement ; la langue de l'éditeur se change sans perdre le contenu.
    await page.reload();
    await page.waitForSelector('.level-form');
    assert.equal(await field('id').inputValue(), '99-essai');
    assert.match(await page.textContent('.author-status'), /restauré/);
    await page.locator('#author-lang').selectOption('en');
    await page.getByRole('button', { name: 'Add a code exercise' }).waitFor();
    assert.equal(await field('steps.1.solution').inputValue(), 'print("b")');
    assert.deepEqual(errors, []);
});

test('fichiers : le dossier data/ survit au rechargement, le reste non', { skip, timeout: 120000 }, async () => {
    const page = await (await browser.newContext()).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const open = async () => {
        await page.goto(`${base}#/levels/01-hello`);
        await page.waitForSelector('.explain', { timeout: 60000 });
        await page.locator('.notebook-action button').click();
        await page.waitForSelector('.cell');
    };
    const run = async (code) => {
        await page.locator('.cell textarea').fill(code);
        await page.locator('.cell-run').click();
        await page.waitForFunction(() => document.querySelector('.cell:last-of-type')?.getAttribute('aria-busy') !== 'true');
        await page.waitForTimeout(200);
        return page.locator('.cell-output').textContent();
    };

    await open();
    assert.equal(await run('with open("data/memo.txt", "w") as f:\n    f.write("persistant")\nopen("hors.txt", "w").write("x")\nprint("écrit")'), 'écrit\n');
    await page.reload(); // nouvelle session : la mémoire de Python est neuve
    await page.waitForSelector('.explain', { timeout: 60000 });
    await page.locator('.notebook-action button').click();
    await page.waitForSelector('.cell');
    assert.equal(await run('import os\nprint(os.path.exists("data/memo.txt"), os.path.exists("hors.txt"))\nprint(open("data/memo.txt").read())'), 'True False\npersistant\n');
    assert.deepEqual(errors, []);
});
