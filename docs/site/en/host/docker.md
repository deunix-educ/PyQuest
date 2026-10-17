# Docker Compose: VPS and intranet

An alternative to the [installers](installers.md): the whole stack runs in containers, with nothing installed on the host
except Docker (with the `docker compose` plugin). Two ready-to-use files, one per situation:

| | Public VPS | Intranet (school network) |
|---|---|---|
| File | `docker/compose.vps.yaml` | `docker/compose.intranet.yaml` |
| Command | `./docker/setup.sh vps` | `./docker/setup.sh intranet` |
| HTTPS | **Let's Encrypt** (`certbot` service, automatic renewal) | **internal certificate authority** created on first start |
| Database | **MariaDB** (`db` service) | **SQLite** (`data` volume) |
| Services | `web` (nginx), `backend` (Django), `db`, `certbot`, `backup` | `web`, `backend`, `backup` |

The images contain the site and the Python engine (Pyodide, downloaded and verified at build time): **no `make build`
needed**, and the server needs no Internet access once the images are built.

## VPS

Requirements: Docker, the domain name pointing to the VPS, ports 80 and 443 free.

```bash
git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest && cd /opt/PyQuest
./docker/setup.sh vps --domain pyquest.example.org --email you@example.org
```

The script generates the secrets in `docker/.env.vps` (mode 600, never committed, never overwritten), builds the images,
starts the stack with a temporary certificate (nginx must answer for Let's Encrypt to validate the domain), obtains the
real certificate, activates it, then offers to create the first administrator. Add `--staging` to try with Let's
Encrypt's test server (no rate limits).

## Intranet

```bash
./docker/setup.sh intranet --host pyquest.school.lan,192.168.1.20
```

Same principle: secrets in `docker/.env.intranet`, internal authority and certificate created on first start in the `tls`
volume (the certificate is reissued automatically before it expires, the authority does not change). **Computers must
trust the authority once**: page `http://<server>/ca` (see [The installers](installers.md), intranet section, including
one browser profile per student). **Back up the authority's key off the server**:
`docker compose -f docker/compose.intranet.yaml --env-file docker/.env.intranet cp web:/etc/pyquest/tls/ca.key ./ca.key`.

## Operations

Run all commands from the repository root (replace `vps` with `intranet` as needed):

```bash
PQ="docker compose -f docker/compose.vps.yaml --env-file docker/.env.vps"
$PQ ps                                   # service status
$PQ logs -f backend                      # logs
$PQ exec backend python manage.py createsuperuser     # administrator (author management: /api/admin/)
git pull && $PQ up -d --build            # update (data, kept in volumes, is preserved)
$PQ down                                 # stop (WITHOUT -v: "down -v" deletes the volumes, hence the data)
```

- **Data**: Docker volumes `db` (MariaDB) or `data` (SQLite), `letsencrypt`, `tls`. An automatic database backup (daily,
  14 kept) is written to `docker/backups/` (`PYQUEST_BACKUP_DIR`); remember to copy it off the server.
- **Restoring**: MariaDB, `gunzip < backup.sql.gz | $PQ exec -T db sh -c 'mariadb -u pyquest -p"$MARIADB_PASSWORD" pyquest'`;
  SQLite, stop `backend`, then replace `/var/lib/pyquest/db.sqlite3` in the `data` volume with the decompressed backup.
- **Let's Encrypt renewal**: `certbot` checks twice a day; nginx reloads the certificate within six hours at most (or
  immediately: `$PQ exec web pyquest-tls reload`).
- **Ports**: Docker publishes 80 and 443 bypassing `ufw` rules; restrict access with the provider's firewall if needed.
  For tests, `--http-port` and `--https-port` pick other ports.
- **Rate limiting**: it relies on the IP address nginx sees. On a standard Docker host this is the client's; behind another
  proxy it would be the proxy's.

## Verified

`make test-docker` builds the images, starts both stacks on free ports, queries nginx over HTTPS (isolation headers,
Python engine, protected editor, administration, static files, synchronisation, database, backups, backend restart,
authority persistence) and tears everything down. **Not verified for real**: obtaining the Let's Encrypt certificate (the
HTTP challenge is tested, not the exchange with Let's Encrypt) and a renewal at expiry.
