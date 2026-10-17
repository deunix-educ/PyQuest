# The installers: VPS and intranet

Two scripts do, **in one command**, everything you would otherwise do by hand. Run them **as root on the server**, from a
clone of the repository (outside `/root` and `/home`, e.g. `/opt/PyQuest`), on **Debian or Ubuntu**. They are
**idempotent**: after an interruption, run the same command again. `--dry-run` prints everything that would be done
without changing anything; `--yes` removes the questions (for automation).

| | Public VPS | Intranet (school network) |
|---|---|---|
| Script | `deploy/install_vps.sh` | `deploy/install_intranet.sh` |
| Site address | a public **domain name** | an internal DNS name **or an IP address** |
| HTTPS | **Let's Encrypt** certificate (renewed by certbot) | **internal certificate authority** created by the installer |
| Database | **MariaDB** | **SQLite** (one file, nothing to administer) |
| Server Internet access | permanent | during installation only (packages, Python engine) |
| Computers must… | nothing | trust the authority, **once** |

## Installing on a VPS

Requirements: the domain name already points to the VPS (A/AAAA record), ports 80 and 443 are free or held by nginx, an
e-mail address for Let's Encrypt.

```bash
git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest && cd /opt/PyQuest
./deploy/install_vps.sh --domain pyquest.example.org --email you@example.org --dry-run   # simulation
./deploy/install_vps.sh --domain pyquest.example.org --email you@example.org
```

The installer chains: pre-flight checks (does the name resolve? are the ports free?), `server_setup.sh` (packages, user,
Python environment, nginx, certificate and its renewal), MariaDB installation if missing (after confirmation),
`db_setup.sh` (database, user, generated password; the MariaDB administrator's password is asked for), service start,
creation of the first administrator, `server_update.sh` (build and publish), daily backup, and a final diagnosis.
Options: `--db-admin-user`, `--port`, `--no-admin`.

## Installing on an intranet

Requirements: a Debian/Ubuntu server on the network (a small machine is enough), reachable by the computers, with
Internet access **during installation**. Decide how computers will reach it: a name (to be declared in the network's DNS)
and/or its **fixed** IP address.

```bash
git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest && cd /opt/PyQuest
./deploy/install_intranet.sh --host pyquest.school.lan,192.168.1.20 --dry-run
./deploy/install_intranet.sh --host pyquest.school.lan,192.168.1.20
```

The installer creates the certificate authority (`/etc/pyquest/tls/ca.crt`) and the server certificate for **each name
and address** given, configures nginx (HTTPS, protected level editor, administration), the SQLite database
(`/var/lib/pyquest/db.sqlite3`), the service, the site publication and two scheduled tasks: daily backup and monthly
renewal of the server certificate. It offers to create the first administrator.

### Why HTTPS, even on an intranet?

Without HTTPS (other than `localhost`), the browser disables the service worker (hence offline mode and installing the
application) and the isolation that allows stopping an infinite loop and using `input()`. The installer sets this up once
and for all; computers only need to **trust the school's authority**.

### Trusting the authority on computers

- **One computer at a time**: open `http://pyquest.school.lan/ca` (page served by the server), download `pyquest-ca.crt`
  and follow the page's instructions (Windows, Firefox, Linux, Android, iOS).
- **A whole fleet**: the network administrator imports `pyquest-ca.crt` into the trusted root authorities through group
  policy (Windows) or the device management tool. Firefox follows the system store when the
  `security.enterprise_roots.enabled` option is on.

This is **done once**: the server certificate is reissued automatically, but the authority (valid for ten years) does not
change.

### Keep in mind

- **Back up `/etc/pyquest/tls/ca.key`** off the server, somewhere safe: it is the authority's key. Losing it means
  redoing the trust on every computer; leaking it would allow impersonating the server. Never distribute it: only
  `ca.crt` and the `/ca` page are public.
- **Accounts**: students have no account (progress stays in their browser, synchronisation is optional). Teacher-authors
  are created in `https://pyquest.school.lan/api/admin/`.
- **Shared computers**: progress is stored per browser and per session; on a shared computer, use one browser profile per
  student, or the progress backup / synchronisation.
- **Updates**: `cd /opt/PyQuest && git pull && ./scripts/server_update.sh` (Internet access is only needed for `git pull`
  and a possible new Python engine).
- **Diagnosis**: `./scripts/vps_doctor.sh` (recognises the intranet installation: certificate validity, renewal task,
  SQLite database, backups).
- **Restoring a backup**: stop the service (`systemctl stop pyquest`), `gunzip < backup.sqlite.gz >
  /var/lib/pyquest/db.sqlite3`, `chown pyquest:pyquest` the file, `systemctl start pyquest`.

Operating details (updates, rollback, troubleshooting) are those of [Going live and operations](operations.md), whose scripts
the intranet installation shares.
