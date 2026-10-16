// Pile complète avec un vrai nginx (mêmes blocs que la production, nginx/pyquest-locations.conf.example) devant dist/
// et Django : isolation, éditeur protégé par connexion, synchronisation. Prérequis : make build ; un binaire nginx
// (PATH ou PYQUEST_NGINX) ; make install (Django).
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
const nginx = process.env.PYQUEST_NGINX || spawnSync('which', ['nginx'], { encoding: 'utf8' }).stdout.trim();
const [port, apiPort] = [8191, 8192];
const base = `http://127.0.0.1:${port}/`;
const PASSWORD = 'un-mot-de-passe-solide-42';
const skip = !existsSync(`${root}dist/index.html`)
    ? 'dist/ absent (make build)'
    : !nginx || !existsSync(nginx)
      ? 'nginx absent (PATH ou PYQUEST_NGINX)'
      : !existsSync(executablePath)
        ? `navigateur absent (${executablePath})`
        : !existsSync(venvPython)
          ? 'make install requis (Django)'
          : false;

let stack;
let browser;
let work;

before(async () => {
    if (skip) return;
    work = mkdtempSync(join(tmpdir(), 'pyquest-stack-'));
    stack = spawn('python3', [`${root}scripts/local_stack.py`, '--port', String(port), '--api-port', String(apiPort), '--workdir', work, '--nginx', nginx], { stdio: 'ignore' });
    // Attend que nginx réponde et que la base existe.
    for (let attempt = 0; attempt < 60; attempt++) {
        const ready = await fetch(base).then((response) => response.ok, () => false);
        if (ready && existsSync(join(work, 'db.sqlite3'))) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const created = spawnSync(venvPython, ['manage.py', 'shell', '-c', `from django.contrib.auth.models import User; User.objects.create_user('ada', password='${PASSWORD}', is_staff=True); User.objects.create_user('lea', password='${PASSWORD}')`], {
        cwd: `${root}backend`,
        env: { ...process.env, DJANGO_SETTINGS_MODULE: 'pyquest_api.settings.dev', PYQUEST_DB_PATH: join(work, 'db.sqlite3') },
    });
    assert.equal(created.status, 0, String(created.stderr));
    browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
});

after(async () => {
    await browser?.close();
    stack?.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (work) rmSync(work, { recursive: true, force: true });
});

test('nginx : en-têtes d\'isolation, types MIME et fichiers publics', { skip, timeout: 60000 }, async () => {
    const check = async (path, expected) => {
        const response = await fetch(`${base}${path}`);
        assert.equal(response.status, 200, path);
        for (const [name, value] of Object.entries(expected)) {
            assert.ok((response.headers.get(name) ?? '').includes(value), `${path} : ${name} attendu « ${value} », reçu « ${response.headers.get(name)} »`);
        }
        return response;
    };
    const isolation = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp', 'cross-origin-resource-policy': 'same-origin' };
    await check('', { ...isolation, 'content-type': 'text/html' });
    await check('css/base.css', { ...isolation, 'content-type': 'text/css' });
    await check('js/main.js', { ...isolation, 'content-type': 'text/javascript' });
    await check('vendor/pyodide/pyodide.asm.wasm', { ...isolation, 'content-type': 'application/wasm', 'cache-control': 'immutable' });
    await check('service-worker.js', { ...isolation, 'cache-control': 'no-cache' });
    await check('manifest.webmanifest', { 'content-type': 'manifest+json' });
    await check('levels/manifest.json', { ...isolation });
    const compressed = await fetch(`${base}js/main.js`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(compressed.headers.get('content-encoding'), 'gzip');
});

test('nginx : l\'éditeur exige une connexion, puis fonctionne isolé ; déconnexion', { skip, timeout: 120000 }, async () => {
    // Sans session : tout fichier de l'éditeur redirige vers la connexion (aucun contenu servi).
    for (const path of ['author.html', 'js/author/main.js', 'css/author.css', 'js/i18n/author.fr.json']) {
        const response = await fetch(`${base}${path}`, { redirect: 'manual' });
        assert.equal(response.status, 302, path);
        assert.match(response.headers.get('location'), /\/api\/auth\/login\/\?next=\//, path);
    }
    // Le contrôle interne n'est pas joignable de l'extérieur.
    assert.equal((await fetch(`${base}api/auth/check/`)).status, 404);

    const context = await browser.newContext({ locale: 'fr-FR' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(`${base}author.html`);
    assert.match(page.url(), /\/api\/auth\/login\/\?next=\/author\.html$/);

    // Un compte qui n'est pas auteur est refusé ; l'auteur arrive sur l'éditeur.
    await page.getByLabel('Identifiant').fill('lea');
    await page.getByLabel('Mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByRole('alert').filter({ hasText: 'incorrect' }).waitFor();
    await page.getByLabel('Identifiant').fill('ada');
    await page.getByLabel('Mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForURL(`${base}author.html`);
    await page.locator('h1').first().waitFor();
    assert.equal(await page.evaluate(() => crossOriginIsolated), true, 'l\'éditeur est isolé (Pyodide)');

    // L'éditeur charge ses modules protégés avec la session (aucune erreur de chargement).
    await page.waitForTimeout(1000);
    assert.deepEqual(errors, []);
    assert.equal((await context.request.get(`${base}js/author/main.js`)).status(), 200);

    // Déconnexion : l'accès est de nouveau refusé.
    await page.goto(`${base}api/auth/login/`);
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByRole('button', { name: 'Se connecter' }).waitFor();
    const after = await context.request.get(`${base}author.html`, { maxRedirects: 0 });
    assert.equal(after.status(), 302);
});

test('nginx : l\'application apprenant est isolée, exécute Python et synchronise par le proxy', { skip, timeout: 120000 }, async () => {
    const page = await (await browser.newContext({ locale: 'fr-FR' })).newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.waitForSelector('.explain', { timeout: 60000 });
    assert.equal(await page.evaluate(() => crossOriginIsolated), true);

    // Synchronisation via /api/ (même origine, Host et limitation de débit corrects).
    await page.locator('#settings-toggle').click();
    const group = page.locator('.settings .sync-group');
    await group.getByRole('button', { name: 'Activer la synchronisation' }).click();
    await group.getByText(/Dernière synchronisation/).waitFor({ timeout: 15000 });
    assert.deepEqual(errors, []);
});
