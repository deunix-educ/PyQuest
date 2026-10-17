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

## Installing on a VPS

!!! tip "One command"
    `./deploy/install_vps.sh` (public VPS) and `./deploy/install_intranet.sh` (school network, no public domain) do
    everything end to end: see [The installers](installers.md). What follows details the steps.

The server is set up **from a clone of the repository, directly on the VPS, as root**: the site is built in place,
then published as successive versions with an atomic switch of the `current` link. The repository is cloned under the
name `PyQuest` (for example `/opt/PyQuest`, outside `/root` and `/home`).

```bash
git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest
cd /opt/PyQuest
./deploy/server_setup.sh --domain pyquest.example.org --dry-run      # simulation
./deploy/server_setup.sh --domain pyquest.example.org --certbot you@mail
```

The whole procedure (MariaDB database, starting the service, first administrator, publishing, backups, rollback,
troubleshooting) is in [Going live and operations](operations.md).

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

`./deploy/server_setup.sh` (see above) does most of the work; here is what it sets up, and what is left to do by hand.

1. **Database: MariaDB** (or MySQL; Django 5.2 requires MariaDB 10.5 or later), with a dedicated database and user
   (`utf8mb4`): `./deploy/db_setup.sh` creates them and stores the generated password (manual method:
   `deploy/mariadb-setup.sql.example`, to copy outside the repository).
2. **Python environment** inside the repository (`/opt/PyQuest/.venv-prod`), with `backend/requirements-prod.txt`
   (Django, gunicorn, `mysqlclient` which is compiled: packages `pkg-config libmariadb-dev build-essential python3-dev`).
3. **Environment variables** in `/etc/pyquest/env` (mode 640, `root:pyquest`, never committed; template:
   `deploy/pyquest.env.example`): `PYQUEST_SECRET_KEY` (**generated** at installation), `PYQUEST_ALLOWED_HOSTS`,
   `PYQUEST_ORIGIN` (`https://your-domain.example`), `PYQUEST_DB_NAME`, `PYQUEST_DB_USER`, `PYQUEST_DB_PASSWORD` (**to
   fill in**), `PYQUEST_DB_HOST` (default `127.0.0.1`), `PYQUEST_DB_PORT` (default `3306`), `PYQUEST_STATIC_ROOT`
   (default `/var/www/pyquest/static`) and `DJANGO_SETTINGS_MODULE=pyquest_api.settings.production`.
4. **systemd service `pyquest`** (`deploy/pyquest.service.example`): gunicorn on `127.0.0.1:PYQUEST_PORT` (default 8001), `pyquest` system
   user; at startup it applies the migrations and collects the administration's static files.
5. **nginx**: `nginx/pyquest.conf.example` (vhost) and the `pyquest-locations.conf` and `pyquest-author-headers.conf`
   snippets in `/etc/nginx/snippets/`; `/api/` is proxied to the service, **on the same domain**.

Production Django commands go through `./scripts/server_manage.sh` (reads `/etc/pyquest/env` without sourcing it and
uses the right Python environment), for example `./scripts/server_manage.sh migrate`.

### Administration and author accounts

Two distinct notions:

- **administrators** (`is_staff`) open the **Django administration** at `/api/admin/`: they create accounts, deactivate
  them, change passwords and decide **who may use the level editor**;
- **authors** (the "May use the level editor" permission, given by the **Auteurs** group) open the editor
  (`author.html`) and nothing else: they have no access to the administration.

**First administrator** (on the server, once):

```bash
./scripts/server_manage.sh createsuperuser     # password of at least 12 characters
```

The administration's static files are collected by the service at startup into `PYQUEST_STATIC_ROOT` (default
`/var/www/pyquest/static`), which nginx serves under `/api/static/` (the `alias` in `pyquest-locations.conf`).

**Managing authors**: open `https://your-domain.example/api/admin/`, sign in, then **Users**:

- tick accounts, choose the action **"Autoriser à utiliser l'éditeur de niveaux"** (or **"Retirer l'accès…"**), then
  **Go**: the **Éditeur de niveaux** column shows the state;
- **Add user** creates an account (username, password); then add it to the **Auteurs** group, or use the action above;
- deactivating an account (the "Active" box) removes all access at the next check.

On the command line, `./scripts/server_manage.sh create_author ada` creates an author account directly, bypassing the
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
