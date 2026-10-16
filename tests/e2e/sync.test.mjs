// Synchronisation entre appareils, de bout en bout : deux contextes Chromium indépendants, le vrai
// backend Django (base jetable) relayé sur /api/ par le serveur de dev, comme nginx en production.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import assert from 'node:assert';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url).pathname;
const executablePath = process.env.CHROMIUM ?? '/usr/bin/chromium';
const venvPython = `${root}.venv/bin/python`;
const [webPort, apiPort, staticPort] = [8131, 8132, 8133];
const web = `http://127.0.0.1:${webPort}/`;
const staticOnly = `http://127.0.0.1:${staticPort}/`;
const skip = !existsSync(`${root}vendor/pyodide/pyodide.mjs`)
    ? 'vendor/pyodide absent'
    : !existsSync(executablePath)
      ? `navigateur absent (${executablePath})`
      : !existsSync(venvPython)
        ? 'make install requis (Django)'
        : false;

const servers = [];
let browser;
let tmp;

before(async () => {
    if (skip) return;
    tmp = mkdtempSync(join(tmpdir(), 'pyquest-sync-'));
    const env = { ...process.env, DJANGO_SETTINGS_MODULE: 'pyquest_api.settings.dev', PYQUEST_DB_PATH: join(tmp, 'db.sqlite3'), PYQUEST_QUIET: '1' };
    const migrate = spawnSync(venvPython, ['manage.py', 'migrate', '--noinput'], { cwd: `${root}backend`, env, stdio: 'ignore' });
    assert.equal(migrate.status, 0, 'migrate');
    servers.push(spawn(venvPython, ['manage.py', 'runserver', String(apiPort), '--noreload'], { cwd: `${root}backend`, env, stdio: 'ignore' }));
    servers.push(spawn('python3', [`${root}scripts/dev_server.py`, '--port', String(webPort), '--api-upstream', `http://127.0.0.1:${apiPort}`], { env, stdio: 'ignore' }));
    servers.push(spawn('python3', [`${root}scripts/dev_server.py`, '--port', String(staticPort)], { env, stdio: 'ignore' }));
    await new Promise((resolve) => setTimeout(resolve, 2500));
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
});

after(async () => {
    await browser?.close();
    servers.forEach((server) => server.kill());
    if (tmp) rmSync(tmp, { recursive: true, force: true });
});

const errors = [];
async function openDevice(url = web) {
    const context = await browser.newContext();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin }).catch(() => {});
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForSelector('.explain', { timeout: 60000 });
    return page;
}

const settings = (page) => page.locator('.settings .sync-group');

async function finishLevelZero(page) {
    for (let i = 0; i < 5; i++) await page.locator('.notebook-action button').last().click();
    await page.waitForSelector('.toast');
}

async function doneCount(page) {
    await page.locator('#levels-toggle').click();
    const count = await page.locator('.level-button.is-done').count();
    await page.keyboard.press('Escape');
    return count;
}

test('synchronisation : activer sur A, lier B, recharger, effacer côté serveur', { skip, timeout: 180000 }, async () => {
    // Appareil A : progression locale, puis activation.
    const a = await openDevice();
    await finishLevelZero(a);
    await a.locator('#settings-toggle').click();
    await settings(a).getByRole('button', { name: 'Activer la synchronisation' }).click();
    await settings(a).getByText(/Dernière synchronisation/).waitFor({ timeout: 15000 });
    const token = await settings(a).getByLabel('Ton jeton secret').inputValue();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);

    // Le focus clavier reste dans la section après le re-rendu.
    assert.ok(await a.evaluate(() => document.activeElement?.closest('.sync-group') !== null));

    // Un jeton invalide est refusé sans appel réseau ni changement d'état.
    const b = await openDevice();
    assert.equal(await doneCount(b), 0);
    await b.locator('#settings-toggle').click();
    await settings(b).getByLabel(/colle le jeton/).fill('trop-court');
    await settings(b).getByRole('button', { name: 'Lier cet appareil' }).click();
    await settings(b).getByText(/n'est pas valide/).waitFor();

    // Appareil B : lien avec le vrai jeton → la progression de A apparaît.
    await settings(b).getByLabel(/colle le jeton/).fill(token);
    await settings(b).getByRole('button', { name: 'Lier cet appareil' }).click();
    await settings(b).getByText(/Appareil lié/).waitFor({ timeout: 15000 });
    await b.keyboard.press('Escape');
    assert.equal(await doneCount(b), 1, 'le niveau terminé sur A est visible sur B');

    // B recharge la page : la synchronisation reste active (jeton conservé).
    await b.reload();
    await b.waitForSelector('.explain', { timeout: 60000 });
    await b.locator('#settings-toggle').click();
    assert.equal(await settings(b).getByLabel('Ton jeton secret').inputValue(), token);
    await b.keyboard.press('Escape');

    // A efface ses données serveur ; un appareil C lié ensuite ne retrouve rien.
    await settings(a).getByRole('button', { name: 'Désactiver et effacer les données du serveur' }).click();
    await settings(a).getByText(/données du serveur effacées/).waitFor({ timeout: 15000 });
    await settings(a).getByRole('button', { name: 'Activer la synchronisation' }).waitFor();

    const c = await openDevice();
    await c.locator('#settings-toggle').click();
    await settings(c).getByLabel(/colle le jeton/).fill(token);
    await settings(c).getByRole('button', { name: 'Lier cet appareil' }).click();
    await settings(c).getByText(/Appareil lié/).waitFor({ timeout: 15000 });
    await c.keyboard.press('Escape');
    assert.equal(await doneCount(c), 0, 'les données effacées du serveur ne reviennent pas');
    assert.deepEqual(errors, []);
});

test('synchronisation : sans backend, message clair et l\'application reste utilisable', { skip, timeout: 120000 }, async () => {
    const page = await openDevice(staticOnly);
    await page.locator('#settings-toggle').click();
    await settings(page).getByRole('button', { name: 'Activer la synchronisation' }).click();
    await settings(page).getByText(/Pas de serveur de synchronisation disponible/).waitFor({ timeout: 15000 });
    await page.keyboard.press('Escape');
    await finishLevelZero(page);
    assert.equal(await doneCount(page), 1);
    assert.deepEqual(errors, []);
});

test('éditeur : connexion d\'un auteur par le backend Django (cookie, CSRF, redirection, refus)', { skip, timeout: 120000 }, async () => {
    const created = spawnSync(venvPython, ['manage.py', 'shell', '-c', "from django.contrib.auth.models import User; from authors import access; access.grant(User.objects.create_user('ada', password='un-mot-de-passe-solide-42')); User.objects.create_user('lea', password='un-mot-de-passe-solide-42')"], {
        cwd: `${root}backend`,
        env: { ...process.env, DJANGO_SETTINGS_MODULE: 'pyquest_api.settings.dev', PYQUEST_DB_PATH: join(tmp, 'db.sqlite3') },
    });
    assert.equal(created.status, 0, String(created.stderr));

    const context = await browser.newContext({ locale: 'fr-FR' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // Sans session : l'autorisation est refusée (c'est ce que nginx verra).
    assert.equal((await page.request.get(`${web}api/auth/check/`)).status(), 401);

    await page.goto(`${web}api/auth/login/?next=/author.html`);
    assert.equal(await page.title(), 'Éditeur de niveaux — connexion');

    // Mauvais mot de passe, puis compte non auteur : message identique, toujours pas de session.
    await page.getByLabel('Identifiant').fill('ada');
    await page.getByLabel('Mot de passe').fill('mauvais');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByRole('alert').filter({ hasText: 'incorrect' }).waitFor();
    await page.getByLabel('Identifiant').fill('lea');
    await page.getByLabel('Mot de passe').fill('un-mot-de-passe-solide-42');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByRole('alert').filter({ hasText: 'incorrect' }).waitFor();
    assert.equal((await page.request.get(`${web}api/auth/check/`)).status(), 401);

    // Bon compte : redirection vers l'éditeur, cookie de session illisible par le JavaScript de la page.
    await page.getByLabel('Identifiant').fill('ada');
    await page.getByLabel('Mot de passe').fill('un-mot-de-passe-solide-42');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForURL(`${web}author.html`);
    assert.equal(await page.evaluate(() => document.cookie.includes('pyquest_author')), false, 'cookie HttpOnly');
    const cookie = (await context.cookies()).find((entry) => entry.name === 'pyquest_author');
    assert.ok(cookie?.httpOnly);
    assert.equal((await page.request.get(`${web}api/auth/check/`)).status(), 204);

    // Un autre navigateur n'a pas la session ; la déconnexion la supprime.
    const other = await browser.newContext({ locale: 'fr-FR' });
    assert.equal((await other.request.get(`${web}api/auth/check/`)).status(), 401);
    await page.goto(`${web}api/auth/login/`);
    await page.getByText('Connecté en tant que ada').waitFor();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByRole('button', { name: 'Se connecter' }).waitFor();
    assert.equal((await page.request.get(`${web}api/auth/check/`)).status(), 401);
    assert.deepEqual(errors, []);
});
