# Going live and operations

Procedure to install PyQuest on a VPS, then run it. Everything is done **on the VPS, as root, from a clone of the
repository** (folder name: `PyQuest`). The scripts are tested without a server; what touches the VPS itself could not be
tried for real before the first installation: start with `--dry-run` and `vps_doctor.sh`.

## Have at hand

- **root** access to the VPS (SSH) and the **domain name**, already pointing to it (A/AAAA record);
- an email address (Let's Encrypt expiry notices);
- the **MariaDB** version in place (10.5 or later) and its administrator access to create a database there;
- a way to **clone the repository**: over HTTPS if the repository is public, otherwise a (read-only) deploy key:
  `ssh-keygen -t ed25519 -f ~/.ssh/pyquest_deploy`, to add in GitHub (*Settings → Deploy keys*);
- nginx 1.25.1 or later preferably (otherwise see the `http2` comment in the examples).

## First installation (in order, as root on the VPS)

| # | Command | Result |
|---|---|---|
| 1 | `git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest && cd /opt/PyQuest` | the code, in a folder named `PyQuest` outside `/root` and `/home` |
| 2 | `./deploy/server_setup.sh --domain pyquest.example.org --dry-run` | **simulation**: nothing is written |
| 3 | `./deploy/server_setup.sh --domain pyquest.example.org --certbot you@mail` | packages, `pyquest` user, folders, Python environment, `/etc/pyquest/env` (secret key generated), systemd service, nginx, certificate |
| 4 | `./deploy/db_setup.sh` | asks for the **MariaDB administrator** password, creates the `pyquest` database and its user, generates a password and writes it to `/etc/pyquest/env` |
| 5 | `systemctl enable --now pyquest` | migrations and static files applied at startup |
| 6 | `./scripts/server_manage.sh createsuperuser` | first administrator |
| 7 | `./scripts/server_update.sh` | the site is built, published, checked |
| 8 | `./scripts/vps_doctor.sh` | everything is "ok" |

Then, in a browser: level 03 (`input()`), `/author.html` (redirects to the login), `/api/admin/` (administration), and
**Settings → Sync → Turn on**.

The scripts are **idempotent**: you can rerun them after an error; they never replace a configuration file or a secret
that is already there. `server_setup.sh` refuses a repository under `/root` or `/home` (the service runs as the `pyquest`
system user and must be able to read the code).

## What the installation does, concretely

| Item | Location on the VPS |
|---|---|
| Cloned repository (backend code, scripts) | `/opt/PyQuest` |
| Backend Python environment | `/opt/PyQuest/.venv-prod` |
| Published site (successive versions) | `/var/www/pyquest/releases/…`, `current` link |
| Administration static files | `/var/www/pyquest/static` |
| Secrets and settings | `/etc/pyquest/env` (mode 640, `root:pyquest`) |
| Service | `pyquest.service` (gunicorn on `127.0.0.1:PYQUEST_PORT`, `pyquest` system user) |
| nginx | `/etc/nginx/sites-available/pyquest`, snippets in `/etc/nginx/snippets/` |
| Backups | `/var/backups/pyquest` |

System names (`pyquest` for the service, the user and `/etc/pyquest`) stay lowercase, as Linux convention wants; only the
repository folder is called `PyQuest`.

### Backend port already in use

The backend listens locally (`127.0.0.1`) on a port that is never exposed to the Internet (nginx connects to it). By
default `server_setup.sh` takes the **first free port from 8001** and records it in `/etc/pyquest/env`
(`PYQUEST_PORT`); the service and nginx both use it. To force one:
`./deploy/server_setup.sh --domain … --port 8011` (rerunnable: it rewrites the unit and the nginx snippet, then restarts the
service if it was running). See the ports in use: `ss -ltnp`.

## Day-to-day operations (as root, in `/opt/PyQuest`)

| I want to… | Command |
|---|---|
| update the site **and** the backend | `./scripts/server_update.sh` (git pull, build, atomic publish, dependencies, restart, check) |
| go back to the previous site version | `./scripts/server_update.sh --rollback` |
| simulate an update | `./scripts/server_update.sh --dry-run` |
| see the server state | `./scripts/vps_doctor.sh` |
| check the published site | `./scripts/check_deploy.sh https://domain` |
| manage authors | `https://domain/api/admin/` or `./scripts/server_manage.sh create_author ada` |
| read the logs | `journalctl -u pyquest -f`; `/var/log/nginx/error.log` |

`server_update.sh` uses `git pull --ff-only`: it refuses to continue if the server's repository has local changes
(do not edit the code on the server; edit it on your machine, push, then update). Options: `--no-pull`, `--no-build`,
`--no-restart`, `--no-check`.

### Database backup

It holds the synced progress and the accounts. `scripts/backup_db.sh` makes a compressed, verified export (an empty
backup is refused) in `/var/backups/pyquest`, and keeps the last 14. Credentials are read from `/etc/pyquest/env`, never
passed on the command line.

```bash
/opt/PyQuest/scripts/backup_db.sh                                                              # by hand
echo '30 3 * * *  root  /opt/PyQuest/scripts/backup_db.sh' > /etc/cron.d/pyquest-backup         # every night
gunzip < /var/backups/pyquest/pyquest-YYYYMMDD-HHMMSS.sql.gz | mariadb pyquest                  # restore
```

Remember to move the backups off the VPS (copy to another machine).

### Security updates

`apt update && apt upgrade` regularly. After a Django upgrade, `./scripts/server_update.sh` reinstalls the dependencies and
restarts the service. The certificate renews itself (`certbot` timer); `vps_doctor.sh` flags an approaching expiry.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `vps_doctor.sh`: `pyquest` service inactive | database password missing or wrong | `journalctl -u pyquest -n 50`, fix `/etc/pyquest/env` |
| the API answers 500 | database unreachable | `systemctl status mariadb`, check `PYQUEST_DB_*` |
| login page: "Forbidden (CSRF)" | wrong `PYQUEST_ORIGIN` | must be exactly `https://domain` |
| administration without styles | static files missing | `systemctl restart pyquest` (reruns `collectstatic`) |
| `input()` unavailable | COOP/COEP headers missing | `./scripts/check_deploy.sh`; check the nginx snippets |
| 502 on `/api/` | service stopped or different port | `systemctl status pyquest`; rerun `server_setup.sh` (realigns nginx and the service) |
| the service does not start, "Address already in use" | backend port taken | `./deploy/server_setup.sh --domain … --port 8011` |
| 503 on the login | nginx rate limit exceeded | wait a minute |
| login refused "Too many attempts" | 5 failures in 15 minutes | wait 15 minutes |
| `ERROR 1045 Access denied for user 'root'` | MariaDB's `root` account requires a password | `./deploy/db_setup.sh` asks for it; another administrator account: `--admin-user name` |
| `server_update.sh`: "local modifications" | a repository file was edited on the server | `git status`; `git checkout -- file` (settings live in `/etc/pyquest/env`, not in the repository) |
| `server_setup.sh`: "pyquest cannot read" | repository in an inaccessible folder | clone under `/opt` |

## Resuming work later

The deployment progress and next steps are in `CONTEXT.md` (section "Déploiement sur le VPS"). To resume a session: read
it, run `make ci` on your machine, then `./scripts/vps_doctor.sh` on the VPS.
