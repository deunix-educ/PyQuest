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

## Host firewall (iptables, ufw)

Docker writes its own firewall rules (`DOCKER`, `DOCKER-USER` chains, address translation). A strict host firewall can
break them. **Typical symptom**, as early as the build: `apk add` or `apt-get` print `DNS: transient error` or
`Temporary failure resolving`, while the host itself reaches the Internet. The failures met on a real VPS (Debian,
nginx and MariaDB already present, custom iptables firewall, `DROP` policies):

| Cause | How to recognise it | Remedy |
|---|---|---|
| The firewall script flushes all chains (`iptables -F`, `-X`, `-t nat -F`) **after** Docker started | `iptables -S DOCKER-USER`: "No chain/target/match by that name" | restart Docker **after** the firewall (see below) |
| Two engines mixed: `iptables` on nftables, rules from Docker or another tool in legacy | `iptables -V` shows `(nf_tables)` and the "iptables-legacy tables present" message; compare `iptables-nft -S` and `iptables-legacy -S` | **a single engine**: the one holding the host firewall; do not switch lightly (you would lose the rules). Docker uses the engine of the `iptables` command |
| `FORWARD` on `DROP` with nothing allowing containers | containers reach nothing (DNS included) | the `DOCKER-USER` rules below |
| Rules written with `iptables -I` in the wrong order | a `DROP` for the public interface runs before the `ACCEPT ... ESTABLISHED`: replies from the Internet are dropped | write with `-A` on an emptied chain (the provided script does) |

### Setup (iptables)

The `docker/firewall/docker-user-rules.sh` script (tested on this VPS) sets up the `DOCKER-USER` chain, which Docker
consults before its own rules: everything is accepted for containers and replies, **only the `PUBLIC_PORTS` (80 and
443) are reachable from the Internet**, anything else arriving on the public interface is refused (without it, every
port published by a container would be open to the world: Docker bypasses `INPUT` rules).

```bash
install -m 755 docker/firewall/docker-user-rules.sh /usr/local/sbin/docker-user-rules.sh
mkdir -p /etc/systemd/system/docker.service.d
printf '[Service]\nExecStartPost=-/usr/local/sbin/docker-user-rules.sh\n' > /etc/systemd/system/docker.service.d/firewall.conf
systemctl daemon-reload && systemctl restart docker
iptables -S DOCKER-USER                                  # the rules are there
docker run --rm alpine apk add --no-cache bash           # the container reaches the Internet
```

- The **`-`** before the `ExecStartPost` path is essential: without it, a script error (missing or non-executable file:
  `status=203/EXEC`) stops Docker, hence every container on the machine.
- Variables: `PUBLIC_PORTS="80 443 8883"` for other ports published by containers that must stay public;
  `TRUSTED_IFS="wg0"` to never filter a VPN. Put them in the unit (`Environment=` in the same `.conf`) rather than in the
  script.
- **Order at boot**: the firewall must run **before** Docker (`Before=docker.service` in its service), or end with
  `systemctl is-active --quiet docker && systemctl restart docker`. For containers to survive that Docker restart, set
  `"live-restore": true` in `/etc/docker/daemon.json`.
- Do **not** put these rules in the general firewall script: it empties the chains, so `DOCKER-USER` does not exist yet
  when they would run.
- To open a test on other ports (`--http-port`, `--https-port`), add them to `PUBLIC_PORTS` for the duration of the
  test, or go through your VPN.
- Also check that no general rule cancels the firewall: for example `iptables -I INPUT -m conntrack --ctstate
  NEW,ESTABLISHED -j ACCEPT` accepts **every** new inbound connection.

### ufw

*Not tried here; standard Docker guidance.* `ufw` does not filter ports published by Docker (`ufw allow/deny` rules do
not apply to them): a published port is open even if `ufw` denies it. To control it, use the same `DOCKER-USER` chain (the
script above works with `ufw`, which also uses `iptables`) or the `ufw-docker` project. If containers have no outbound
access, set `DEFAULT_FORWARD_POLICY="ACCEPT"` in `/etc/default/ufw`, then `ufw reload`, and allow the traffic of `docker0`
and the `br-…` networks.

### Other points specific to a VPS that already hosts something else

- **Ports 80 and 443**: a host nginx and the Docker stack cannot share them (`address already in use`). For a test, stop
  nginx; for lasting coexistence, use `--http-port`/`--https-port` behind another proxy, or the classic installation
  instead of Docker.
- **Host MariaDB**: no conflict, the Docker stack's database is not published.
- **Let's Encrypt**: port 80 must be reachable from the Internet (hence in `PUBLIC_PORTS`).

## Verified

`make test-docker` builds the images, starts both stacks on free ports, queries nginx over HTTPS (isolation headers,
Python engine, protected editor, administration, static files, synchronisation, database, backups, backend restart,
authority persistence) and tears everything down. **Not verified for real**: obtaining the Let's Encrypt certificate (the
HTTP challenge is tested, not the exchange with Let's Encrypt) and a renewal at expiry.
