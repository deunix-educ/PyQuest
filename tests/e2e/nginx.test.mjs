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
    const created = spawnSync(venvPython, ['manage.py', 'shell', '-c', `from django.contrib.auth.models import User; from authors import access; access.grant(User.objects.create_user('ada', password='${PASSWORD}')); User.objects.create_user('lea', password='${PASSWORD}'); User.objects.create_superuser('root', password='${PASSWORD}')`], {
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
    // La documentation en ligne exige elle aussi une connexion (aucune page servie).
    for (const path of ['docs/', 'docs/fr/', 'docs/assets/stylesheets/main.css']) {
        const response = await fetch(`${base}${path}`, { redirect: 'manual' });
        assert.equal(response.status, 302, path);
        assert.match(response.headers.get('location'), /\/api\/auth\/login\/\?next=\/docs\//, path);
    }
    // Le contrôle interne n'est pas joignable de l'extérieur.
    assert.equal((await fetch(`${base}api/auth/check/`)).status, 404);
    assert.equal((await fetch(`${base}api/auth/check-docs/`)).status, 404);

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

    // La documentation est lisible avec la session, isolée comme le reste, et l'éditeur y renvoie par un lien.
    await page.locator('#author-docs').waitFor();
    const docs = await context.request.get(`${base}docs/`);
    assert.equal(docs.status(), 200);
    assert.match(await docs.text(), /PyQuest/);
    assert.equal(docs.headers()['cross-origin-opener-policy'], 'same-origin');

    // Déconnexion depuis l'éditeur lui-même : nom affiché, bouton, retour à la page de connexion.
    await page.getByText('Connecté : ada').waitFor();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.waitForURL(/\/api\/auth\/login\//);
    await page.getByRole('button', { name: 'Se connecter' }).waitFor();
    const after = await context.request.get(`${base}author.html`, { maxRedirects: 0 });
    assert.equal(after.status(), 302);
    assert.equal((await context.request.get(`${base}docs/`, { maxRedirects: 0 })).status(), 302, 'la documentation se referme avec la session');
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

test('nginx : l\'administrateur autorise un compte à utiliser l\'éditeur depuis l\'administration Django', { skip, timeout: 120000 }, async () => {
    // Les fichiers statiques de l'administration passent par nginx (alias), avec le bon type MIME.
    const css = await fetch(`${base}api/static/admin/css/base.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);

    const admin = await (await browser.newContext({ locale: 'fr-FR' })).newPage();
    const errors = [];
    admin.on('pageerror', (error) => errors.push(error.message));
    // Un compte sans permission n'entre pas dans l'administration.
    await admin.goto(`${base}api/admin/`);
    await admin.getByLabel(/Nom d.utilisateur/).fill('lea');
    await admin.getByLabel('Mot de passe :').fill(PASSWORD);
    await admin.getByRole('button', { name: 'Connexion' }).click();
    await admin.locator('.errornote').waitFor();
    // L'administrateur entre, voit les comptes et donne l'accès à « lea ».
    await admin.getByLabel(/Nom d.utilisateur/).fill('root');
    await admin.getByLabel('Mot de passe :').fill(PASSWORD);
    await admin.getByRole('button', { name: 'Connexion' }).click();
    await admin.getByText('PyQuest — administration').first().waitFor();
    // Le lien « Documentation » de l'administration mène à la documentation, ouverte à l'administrateur.
    await admin.getByRole('link', { name: 'Documentation' }).waitFor();
    assert.equal((await admin.context().request.get(`${base}docs/`)).status(), 200);
    await admin.goto(`${base}api/admin/auth/user/`);
    await admin.locator('tr', { hasText: 'lea' }).locator('input[type=checkbox]').check();
    await admin.locator('select[name=action]').selectOption('grant_editor');
    await admin.getByRole('button', { name: 'Envoyer' }).click();
    await admin.getByText(/autorisé\(s\) à utiliser l.éditeur/).waitFor();

    // « lea » ouvre maintenant l'éditeur ; elle n'a pas accès à l'administration.
    const author = await (await browser.newContext({ locale: 'fr-FR' })).newPage();
    await author.goto(`${base}author.html`);
    await author.getByLabel('Identifiant').fill('lea');
    await author.getByLabel('Mot de passe').fill(PASSWORD);
    await author.getByRole('button', { name: 'Se connecter' }).click();
    await author.waitForURL(`${base}author.html`);
    await author.goto(`${base}api/admin/`);
    await author.getByText(/pas autorisé/).waitFor();

    // Retrait de l'accès : le contrôle suivant refuse.
    await admin.goto(`${base}api/admin/auth/user/`);
    await admin.locator('tr', { hasText: 'lea' }).locator('input[type=checkbox]').check();
    await admin.locator('select[name=action]').selectOption('revoke_editor');
    await admin.getByRole('button', { name: 'Envoyer' }).click();
    await admin.getByText(/Accès retiré/).waitFor();
    const refused = await author.context().request.get(`${base}author.html`, { maxRedirects: 0 });
    assert.equal(refused.status(), 302);
    assert.deepEqual(errors, []);
});
