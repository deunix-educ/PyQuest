# Going live and operations

This page is the **roadmap** for installing PyQuest on a VPS, then running it. It relies on scripts tested without a
server; what touches the VPS itself could not be tried for real before the first installation: always start with
`--dry-run` and `vps-doctor`.

## Have at hand

- the VPS SSH address and your key (`user@host`), the user having `sudo`;
- the **domain name**, already pointing to the VPS (A/AAAA record);
- an email address (Let's Encrypt expiry notices);
- the **MariaDB** version in place (10.5 or later) and administrator access to create a database there;
- nginx 1.25.1 or later preferably (otherwise see the `http2` comment in the examples).

## First installation (in order)

| # | Where | Command | Result |
|---|---|---|---|
| 1 | your machine | `make ci` | everything green before sending |
| 2 | your machine | `DEPLOY_HOST=u@h make vps-bootstrap DOMAIN=pyquest.example.org ARGS=--dry-run` | **simulation**: nothing is written to the VPS |
| 3 | your machine | `DEPLOY_HOST=u@h make vps-bootstrap DOMAIN=pyquest.example.org ARGS="--certbot you@mail"` | packages, `pyquest` user, folders, Python environment, environment file (secret key generated), systemd service, nginx, certificate |
| 4 | VPS | adapt then `sudo mariadb < deploy/mariadb-setup.sql.example` | `pyquest` database and its user |
| 5 | VPS | put the database password in `/etc/pyquest/env` (`PYQUEST_DB_PASSWORD`) | the service can connect |
| 6 | VPS | `sudo systemctl enable --now pyquest` | migrations and static files applied at startup |
| 7 | VPS | `createsuperuser` (command printed at the end of the installation) | first administrator |
| 8 | your machine | `DEPLOY_HOST=u@h make deploy` | the site is online |
| 9 | your machine | `make check-deploy URL=https://pyquest.example.org` | headers, MIME types, Python engine, HTTPS redirect |
| 10 | your machine | `DEPLOY_HOST=u@h make vps-doctor` | everything is "ok" |

Then, in a browser: level 03 (`input()`), `/author.html` (redirects to the login), `/api/admin/` (administration), and
**Settings → Sync → Turn on**.

The scripts are **idempotent**: you can rerun them after an error; they never replace a configuration file or a secret
that is already there.

## What the installation does, concretely

| Item | Location on the VPS |
|---|---|
| Static site (successive versions) | `/var/www/pyquest/releases/…`, `current` link |
| Administration static files | `/var/www/pyquest/static` |
| Backend code | `/opt/pyquest/backend` |
| Python environment | `/opt/pyquest/venv` |
| Secrets and settings | `/etc/pyquest/env` (mode 640, `root:pyquest`) |
| Service | `pyquest.service` (gunicorn, `127.0.0.1:8001`, `pyquest` system user) |
| nginx | `/etc/nginx/sites-available/pyquest`, snippets in `/etc/nginx/snippets/` |
| Backups | `/var/backups/pyquest` |

The only right given without a password to your user is `systemctl restart|status pyquest`
(`/etc/sudoers.d/pyquest`).

## Day-to-day operations

| I want to… | Command |
|---|---|
| publish a new site version | `DEPLOY_HOST=u@h make deploy` |
| go back to the previous site version | `DEPLOY_HOST=u@h ./scripts/deploy.sh --rollback` |
| publish a new backend version | `DEPLOY_HOST=u@h make deploy-backend` (restarts the service; automatic migrations) |
| see the server state | `DEPLOY_HOST=u@h make vps-doctor` |
| read the logs | `journalctl -u pyquest -f`; `/var/log/nginx/error.log` |
| manage authors | `https://domain/api/admin/` |
| check the published site | `make check-deploy URL=https://domain` |

### Database backup

It holds the synced progress and the accounts. `scripts/backup_db.sh` makes a compressed, verified export (an empty
backup is refused) in `/var/backups/pyquest`, and keeps the last 14. Credentials are read from `/etc/pyquest/env`,
never passed on the command line.

```bash
sudo ./scripts/backup_db.sh                         # by hand
echo '30 3 * * *  root  /opt/pyquest/scripts/backup_db.sh' | sudo tee /etc/cron.d/pyquest-backup   # every night
gunzip < /var/backups/pyquest/pyquest-YYYYMMDD-HHMMSS.sql.gz | sudo mariadb pyquest                # restore
```

(The installation puts the script in `/opt/pyquest/scripts/`.) Remember to move the backups off the VPS (copy to another machine).

### Security updates

`sudo apt update && sudo apt upgrade` regularly; after a Django upgrade (`pip install -r
backend/requirements-prod.txt`), rerun `make deploy-backend`. The certificate renews itself (`certbot` timer);
`vps-doctor` flags an approaching expiry.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `vps-doctor`: `pyquest` service inactive | database password missing or wrong | `journalctl -u pyquest -n 50`, fix `/etc/pyquest/env` |
| the API answers 500 | database unreachable | `systemctl status mariadb`, check `PYQUEST_DB_*` |
| login page: "Forbidden (CSRF)" | wrong `PYQUEST_ORIGIN` | must be exactly `https://domain` |
| administration without styles | static files missing | `sudo systemctl restart pyquest` (reruns `collectstatic`) |
| `input()` unavailable | COOP/COEP headers missing | `make check-deploy`; check the nginx snippets |
| 502 on `/api/` | service stopped | `sudo systemctl status pyquest` |
| 503 on the login | nginx rate limit exceeded | wait a minute |
| login refused "Too many attempts" | 5 failures in 15 minutes | wait 15 minutes |

## Resuming work later

The deployment progress and next steps are in `CONTEXT.md` (section "Déploiement sur le VPS"). To resume a session:
read it, run `make ci`, then `make vps-doctor` to see where the server stands.
