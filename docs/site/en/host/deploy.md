# Deployment

PyQuest is a **static application**: a web server is enough. A Django backend is **optional** (progress sync).

## Requirements

Python 3.12+, Node.js 20+, `make`, `curl`.

## Build

```bash
make install     # development tools + pinned Pyodide in vendor/pyodide
make build       # produces dist/ (static application)
```

Serve the content of `dist/` at the **root of a domain**, over **HTTPS**.

## Required headers

To interrupt an infinite loop cleanly and allow `input()`, the site must be **isolated**:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

Without them the app works but must restart its engine to stop a program, and `input()` is unavailable.
Consequence: **everything is served from the same domain**, including the Python engine (Pyodide, never from a
CDN) and the fonts.

A complete nginx configuration example (MIME types, headers, cache, API) is provided in
`nginx/pyquest.conf.example`.

## Deploying to a VPS, step by step

Assumptions: a Linux VPS with **nginx**, a **domain name** pointing to it, and **SSH key** access.

**1. On the VPS (once)**

```bash
sudo mkdir -p /var/www/pyquest /var/www/letsencrypt
sudo chown "$USER" /var/www/pyquest          # the SSH user must be able to write here
sudo apt install nginx certbot rsync
```

Then install the vhost: copy `nginx/pyquest-static.conf.example` (no backend; with the Django backend, `nginx/pyquest.conf.example`, see below) to `/etc/nginx/sites-available/pyquest` and
replace `pyquest.example.org` with your domain. The certificate does not exist yet: **first comment out the second
`server` block** (the port 443 one), then:

```bash
sudo ln -s /etc/nginx/sites-available/pyquest /etc/nginx/sites-enabled/pyquest
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt -d your-domain.example   # Let's Encrypt
```

Then uncomment the 443 block and reload nginx (`sudo nginx -t && sudo systemctl reload nginx`). Certificate renewal is
automatic (the `certbot` package timer); nginx must be reloaded after each renewal:
`sudo sh -c 'printf "#!/bin/sh\nsystemctl reload nginx\n" > /etc/letsencrypt/renewal-hooks/deploy/nginx && chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx'`.

**2. On your machine: deploy**

```bash
make install
DEPLOY_HOST=user@your-domain.example make deploy
```

`make deploy` builds `dist/`, uploads the files to `releases/<date>-<commit>/` on the VPS (only changed files
travel), then switches the `current` link **in one atomic step**: the site is never half-updated. The last 3
versions are kept. Variables: `DEPLOY_PATH` (default `/var/www/pyquest`), `DEPLOY_KEEP`.
`./scripts/deploy.sh --dry-run` shows what would be sent without changing anything.

**3. Check**

```bash
make check-deploy URL=https://your-domain.example
```

The check verifies the isolation headers, MIME types, the Python engine, the service worker and the HTTPS
redirect. Then open the site: a level with `input()` (level 03) confirms isolation works.

**4. Update or roll back**

```bash
DEPLOY_HOST=user@your-domain.example make deploy                    # new version
DEPLOY_HOST=user@your-domain.example ./scripts/deploy.sh --rollback  # previous version
```

Browsers pick up the new version on reload (pages and scripts go network first).

!!! warning "If something goes wrong"
    - **`input()` unavailable, or stopping a loop restarts the engine**: the COOP/COEP/CORP headers are missing.
      `make check-deploy` reports it.
    - **Blank page, scripts refused**: wrong MIME type (a `types` block forgotten or incomplete).
    - **Old version shown**: check that `service-worker.js` is served with `Cache-Control: no-cache`.
    - The script never uses `sudo` or a password: only your SSH key is used, and nothing secret is in the repository.

## Testing locally before deploying

Three levels of testing, from the simplest to the most faithful to production:

| Command | What it starts | What it lets you try |
|---|---|---|
| `make dev` | development server (`http://127.0.0.1:8000/`) | the app alone |
| `make dev-sync` | same + Django backend, `/api/` proxied | sync, the login page (`/api/auth/login/`); the editor is **not** protected there |
| `make dev-nginx` | **real nginx** + Django + `dist/` (`http://127.0.0.1:8080/`) | everything: isolation headers, MIME types, the login-protected editor, sync |

`make dev-nginx` uses **the same blocks as production** (`nginx/pyquest-locations.conf.example`): what you see locally
is what will be deployed. It builds `dist/`, creates a throwaway SQLite database in `.local/stack/`, offers to create
an author account, then starts nginx and Django. **There is no default account**: on first launch, in a terminal, it asks you
to create the **administrator** account (password of at least 12 characters). Otherwise: `make dev-admin`. Sign in at
`http://127.0.0.1:8080/api/admin/` to create authors and give them access to the editor; an administrator can also open
the editor. Shortcut bypassing the administration: `make dev-author NAME=ada` (`RESET=--reset` to change the password). Stop with `Ctrl + C`. Logs: `.local/stack/logs/`.

nginx does not need to be installed as a service: only the binary is used. The easiest way (Debian/Ubuntu, no administrator rights): `make fetch-nginx`, which extracts it into `.local/nginx/`; `make dev-nginx` then finds it by itself. By hand:

```bash
mkdir -p /tmp/ngx && cd /tmp/ngx && apt-get download nginx && dpkg -x nginx_*.deb root
PYQUEST_NGINX=/tmp/ngx/root/usr/sbin/nginx make dev-nginx
```

(the variable is `PYQUEST_NGINX`: nginx itself reads a variable named `NGINX`, which does not work here.)

**Journey to try** on `http://127.0.0.1:8080/`:

1. The app opens; a level with `input()` (level 03) works: isolation is active.
2. `http://127.0.0.1:8080/author.html` **redirects to the login page**. A wrong password is refused; the right account
   reaches the editor; "Sign out" (on the login page) closes access again.
3. **Settings → Sync → Turn on** works (the "Last sync" line appears).
4. Check a site (local or remote): `make check-deploy URL=http://127.0.0.1:8080`.

The automated tests do this journey: `make test-e2e` includes `tests/e2e/nginx.test.mjs` (skipped if no nginx binary is
found).

## Caching

A service worker makes the app usable offline: pages and scripts are **network first** (an update is seen on
reload), the Python engine is **cache first** (versioned, immutable files).

## Django backend (optional): sync and editor access

The Django backend does **two things**, both optional: sync progress between devices, and **protect access to the
level editor** (`author.html`) with a login. The learning application works entirely without it.

1. **Database: MariaDB** (or MySQL). Create a dedicated database and user (`utf8mb4` character set):

    ```sql
    CREATE DATABASE pyquest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER 'pyquest'@'localhost' IDENTIFIED BY '…a long password…';
    GRANT ALL PRIVILEGES ON pyquest.* TO 'pyquest'@'localhost';
    ```

2. **Install** in a dedicated virtual environment (Django 5.2 requires MariaDB 10.5 or later):

    ```bash
    sudo apt install pkg-config libmariadb-dev build-essential python3-dev   # to build mysqlclient
    python3 -m venv /opt/pyquest/venv
    /opt/pyquest/venv/bin/pip install -r backend/requirements-prod.txt
    ```

3. **Environment variables** (never committed; for example in a file read by the systemd unit, mode `600`):
   `PYQUEST_SECRET_KEY` (long random string), `PYQUEST_ALLOWED_HOSTS` (your domain), `PYQUEST_ORIGIN`
   (`https://your-domain.example`), `PYQUEST_DB_NAME`, `PYQUEST_DB_USER`, `PYQUEST_DB_PASSWORD`, and if needed
   `PYQUEST_DB_HOST` (default `127.0.0.1`), `PYQUEST_DB_PORT` (default `3306`) and `PYQUEST_STATIC_ROOT` (default
   `/var/www/pyquest/static`, the administration's static files). Settings:
   `DJANGO_SETTINGS_MODULE=pyquest_api.settings.production`.
4. **Create the tables**: `python manage.py migrate` (in `backend/`).
5. **Run** with `gunicorn` on `127.0.0.1:8001` (`gunicorn pyquest_api.wsgi --bind 127.0.0.1:8001`), managed by
   systemd. nginx proxies `/api/` to it, **on the same domain**: use `nginx/pyquest.conf.example`, and copy
   `nginx/pyquest-locations.conf.example` and `nginx/pyquest-author-headers.conf.example` into `/etc/nginx/snippets/` as
   `pyquest-locations.conf` and `pyquest-author-headers.conf`.

### Administration and author accounts

Two distinct notions:

- **administrators** (`is_staff`) open the **Django administration** at `/api/admin/`: they create accounts, deactivate
  them, change passwords and decide **who may use the level editor**;
- **authors** (the "May use the level editor" permission, given by the **Auteurs** group) open the editor
  (`author.html`) and nothing else: they have no access to the administration.

**First administrator** (on the server, once):

```bash
cd backend && python manage.py createsuperuser     # password of at least 12 characters
python manage.py collectstatic --noinput           # administration files, served by nginx
```

`collectstatic` writes into `PYQUEST_STATIC_ROOT` (default `/var/www/pyquest/static`), which nginx serves under
`/api/static/` (the `alias` in `pyquest-locations.conf`). Redo it after a Django upgrade.

**Managing authors**: open `https://your-domain.example/api/admin/`, sign in, then **Users**:

- tick accounts, choose the action **"Autoriser à utiliser l'éditeur de niveaux"** (or **"Retirer l'accès…"**), then
  **Go**: the **Éditeur de niveaux** column shows the state;
- **Add user** creates an account (username, password); then add it to the **Auteurs** group, or use the action above;
- deactivating an account (the "Active" box) removes all access at the next check.

On the command line, `python manage.py create_author ada` creates an author account directly, bypassing the
administration; `--reset` changes its password, `--admin` makes it an administrator (access to `/api/admin/`).

An administrator can also use the editor (a superuser has every permission). The `is_staff` status alone is **not
enough** to open the editor.

**Security**:

- 8-hour session, `HttpOnly` and `Secure` cookie, CSRF-protected forms, pages that cannot be framed
  (`X-Frame-Options`);
- **brute-force protection** shared by the editor login and the administration login: after 5 failures on an account
  (or 20 from one address) within 15 minutes, logins are refused; nginx also rate-limits;
- to reduce the exposure of `/api/admin/` further, uncomment `allow` / `deny` in `pyquest-locations.conf` (restrict it to
  your network) or only reach it through a VPN;
- no password recovery by email: an administrator changes it (administration or `create_author --reset`).

### Privacy

For sync, the server stores, for each token, the **token fingerprint** (SHA-256) and the **progress JSON** (completed
levels, badges, streak). No learner account, no email address, no analytics. Users can erase everything from the
settings (`DELETE` route). Accounts (authors, administrators) only hold a username and the (hashed) password.

## Without a backend

Serving `dist/` is enough (`nginx/pyquest-static.conf.example`). The "Sync" section of the settings then says no server
is available, and file backup remains usable. The level editor (`author.html`) is then **public**: to avoid exposing
it, use the backend above or delete it from `dist/` before uploading.
