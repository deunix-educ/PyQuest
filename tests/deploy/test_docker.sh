#!/usr/bin/env bash
# Essai réel des compose Docker : construit les images, démarre la pile INTRANET (autorité interne, SQLite) et la pile VPS
# (MariaDB, certificat provisoire : Let's Encrypt n'est pas joignable en test) sur des ports libres, interroge nginx en
# HTTPS (curl ne fait confiance qu'à l'autorité de la pile), vérifie en-têtes d'isolation, éditeur protégé, administration,
# fichiers statiques, sauvegardes, puis détruit tout (volumes compris). Dure quelques minutes la première fois.
# Ignoré (code 0) si Docker n'est pas utilisable. Lancé par « make test-docker » (pas par « make ci »).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
docker info >/dev/null 2>&1 || { echo "docker : démon indisponible, essai ignoré"; exit 0; }
docker compose version >/dev/null 2>&1 || { echo "docker compose : absent, essai ignoré"; exit 0; }
WORK="$(mktemp -d)"
fail() { echo "ÉCHEC : $1" >&2; exit 1; }

free_port() { # premier port libre à partir de $1
    local port="$1"
    while ss -ltnH | awk '{print $4}' | grep -qE "[:.]${port}\$"; do port=$((port + 1)); done
    echo "${port}"
}
HTTP="$(free_port 18080)"; HTTPS="$(free_port 18443)"
[[ "${HTTPS}" != "${HTTP}" ]] || HTTPS="$(free_port $((HTTP + 1)))"

declare -a COMPOSES=()
cleanup() {
    for c in "${COMPOSES[@]}"; do eval "${c} down -v --remove-orphans" >/dev/null 2>&1 || true; done
    rm -rf "${WORK}" "${ROOT}/docker/.env.test-"*
}
trap cleanup EXIT

# Les fichiers d'environnement de l'essai ont un nom à part : ceux de l'utilisateur (docker/.env.vps, .env.intranet)
# ne sont jamais touchés.
secret="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
BACKUPS="${WORK}/backups"; mkdir -p "${BACKUPS}"

check_stack() { # nom curl-args... : vérifications communes une fois la pile démarrée
    local name="$1" host="$2"; shift 2
    local base="https://${host}:${HTTPS}" curl_args=("$@")
    c() { curl -s "${curl_args[@]}" "$@"; }
    [[ "$(c -o /dev/null -w '%{http_code}' "${base}/")" == 200 ]] || fail "${name} : la page d'accueil doit répondre 200"
    headers="$(c -I "${base}/" | tr -d '\r')"
    echo "${headers}" | grep -qi '^cross-origin-opener-policy: same-origin' || fail "${name} : COOP manquant"
    echo "${headers}" | grep -qi '^cross-origin-embedder-policy: require-corp' || fail "${name} : COEP manquant"
    [[ "$(c -o /dev/null -w '%{http_code}' "${base}/vendor/pyodide/pyodide.asm.wasm")" == 200 ]] || fail "${name} : le moteur Python (wasm) doit être servi"
    [[ "$(c -I "${base}/vendor/pyodide/pyodide.asm.wasm" | tr -d '\r' | grep -ci 'content-type: application/wasm')" == 1 ]] || fail "${name} : type MIME wasm"
    code_loc="$(c -o /dev/null -w '%{http_code} %{redirect_url}' "${base}/author.html")"
    [[ "${code_loc}" == "302 "*"/api/auth/login/?next=/author.html" ]] || fail "${name} : author.html doit renvoyer vers la connexion (reçu : ${code_loc})"
    docs_loc="$(c -o /dev/null -w '%{http_code} %{redirect_url}' "${base}/docs/")"
    [[ "${docs_loc}" == "302 "*"/api/auth/login/?next=/docs/" ]] || fail "${name} : /docs/ doit exiger une connexion (reçu : ${docs_loc})"
    [[ "$(c -o /dev/null -w '%{http_code}' "${base}/api/auth/check-docs/")" == 404 ]] || fail "${name} : /api/auth/check-docs/ doit rester interne"
    [[ "$(c -o /dev/null -w '%{http_code}' "${base}/api/auth/login/")" == 200 ]] || fail "${name} : page de connexion"
    [[ "$(c -o /dev/null -w '%{http_code}' "${base}/api/auth/check/")" == 404 ]] || fail "${name} : /api/auth/check/ doit rester interne"
    [[ "$(c -o /dev/null -w '%{http_code}' "${base}/api/static/admin/css/base.css")" == 200 ]] || fail "${name} : fichiers statiques de l'administration (volume partagé)"
    [[ "$(c -o /dev/null -w '%{http_code}' "${base}/api/admin/")" == 302 ]] || fail "${name} : administration protégée"
    [[ "$(c -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "${base}/api/sync/")" == 404 ]] || fail "${name} : l'API de synchronisation doit joindre la base (404 attendu)"
    [[ "$(c -o /dev/null -w '%{http_code}' "http://${host}:${HTTP}/")" == 301 ]] || fail "${name} : HTTP doit rediriger vers HTTPS"
}

# ---- intranet -----------------------------------------------------------------------------------------------------------
ENVI="${ROOT}/docker/.env.test-intranet"
cat > "${ENVI}" <<ENV
PYQUEST_SECRET_KEY=${secret}
PYQUEST_HOSTS=localhost,127.0.0.1
PYQUEST_ORIGINS=https://localhost:${HTTPS},https://127.0.0.1:${HTTPS}
PYQUEST_HTTP_PORT=${HTTP}
PYQUEST_HTTPS_PORT=${HTTPS}
PYQUEST_BACKUP_DIR=${BACKUPS}/intranet
ENV
mkdir -p "${BACKUPS}/intranet"
DCI="docker compose -f ${ROOT}/docker/compose.intranet.yaml --env-file ${ENVI} -p pyquest-test-intranet"
COMPOSES+=("${DCI}")
$DCI up -d --build --wait --wait-timeout 300 web backup >/dev/null 2>&1 || { $DCI logs --tail 40 >&2; fail "la pile intranet ne démarre pas"; }
$DCI cp web:/etc/pyquest/tls/ca.crt "${WORK}/ca.crt" >/dev/null 2>&1
[[ -s "${WORK}/ca.crt" ]] || fail "l'autorité interne doit être créée au premier démarrage"
check_stack intranet localhost --cacert "${WORK}/ca.crt"
[[ "$(curl -s --cacert "${WORK}/ca.crt" -o /dev/null -w '%{http_code}' "https://127.0.0.1:${HTTPS}/")" == 200 ]] || fail "intranet : l'adresse IP doit être dans le certificat"
curl -s -o /dev/null "https://localhost:${HTTPS}/" 2>/dev/null && fail "intranet : sans confiance dans l'autorité, la connexion doit être refusée"
curl -s "http://localhost:${HTTP}/pyquest-ca.crt" | cmp -s - "${WORK}/ca.crt" || fail "intranet : /pyquest-ca.crt doit servir l'autorité"
[[ "$($DCI exec -T backend sh -c 'for p in /proc/[0-9]*; do awk "/^Uid/{print \$2}" $p/status; done | sort -u | tr "\n" " "')" == *10001* ]] || fail "intranet : gunicorn doit tourner sans privilèges"
$DCI exec -T -e DJANGO_SUPERUSER_PASSWORD="Essai-${secret:0:12}" backend python manage.py createsuperuser --noinput --username essai --email essai@example.org >/dev/null 2>&1 || fail "intranet : création de l'administrateur"
for _ in $(seq 1 20); do ls "${BACKUPS}/intranet"/pyquest-*.sqlite.gz >/dev/null 2>&1 && break; sleep 1; done
gunzip -c "$(ls "${BACKUPS}/intranet"/pyquest-*.sqlite.gz | head -n1)" | wc -c | grep -qvx 0 || fail "intranet : sauvegarde SQLite absente ou vide"
# Un backend recréé (nouvelle adresse) ne doit pas obliger à redémarrer nginx.
$DCI up -d --force-recreate --wait --wait-timeout 120 backend >/dev/null 2>&1
sleep 2
[[ "$(curl -s --cacert "${WORK}/ca.crt" -o /dev/null -w '%{http_code}' "https://localhost:${HTTPS}/api/auth/login/")" == 200 ]] || fail "intranet : nginx doit retrouver un backend recréé"
# L'autorité survit à un arrêt/redémarrage (volume).
$DCI down >/dev/null 2>&1
$DCI up -d --wait --wait-timeout 120 web >/dev/null 2>&1
$DCI cp web:/etc/pyquest/tls/ca.crt "${WORK}/ca2.crt" >/dev/null 2>&1
cmp -s "${WORK}/ca.crt" "${WORK}/ca2.crt" || fail "intranet : l'autorité ne doit pas changer au redémarrage"
$DCI down -v >/dev/null 2>&1

# ---- VPS (certificat provisoire) ------------------------------------------------------------------------------------------
ENVV="${ROOT}/docker/.env.test-vps"
cat > "${ENVV}" <<ENV
PYQUEST_DOMAIN=localhost.example.org
PYQUEST_EMAIL=essai@example.org
PYQUEST_SECRET_KEY=${secret}
PYQUEST_DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_hex(16))')
PYQUEST_HTTP_PORT=${HTTP}
PYQUEST_HTTPS_PORT=${HTTPS}
PYQUEST_ORIGIN_PORT=:${HTTPS}
PYQUEST_BACKUP_DIR=${BACKUPS}/vps
ENV
mkdir -p "${BACKUPS}/vps"
DCV="docker compose -f ${ROOT}/docker/compose.vps.yaml --env-file ${ENVV} -p pyquest-test-vps"
COMPOSES+=("${DCV}")
$DCV up -d --build --wait --wait-timeout 300 web >/dev/null 2>&1 || { $DCV logs --tail 40 >&2; fail "la pile VPS ne démarre pas"; }
check_stack vps localhost.example.org -k --resolve "localhost.example.org:${HTTPS}:127.0.0.1" --resolve "localhost.example.org:${HTTP}:127.0.0.1"
# Défi Let's Encrypt : le dossier du webroot est servi en HTTP, sans redirection.
$DCV exec -T web sh -c 'mkdir -p /var/www/letsencrypt/.well-known/acme-challenge && echo challenge-ok > /var/www/letsencrypt/.well-known/acme-challenge/probe'
[[ "$(curl -s --resolve "localhost.example.org:${HTTP}:127.0.0.1" "http://localhost.example.org:${HTTP}/.well-known/acme-challenge/probe")" == challenge-ok ]] || fail "vps : le défi ACME doit être servi en HTTP"
$DCV exec -T db sh -c 'mariadb -u pyquest -p"$MARIADB_PASSWORD" pyquest -e "select count(*) from django_migrations" >/dev/null' || fail "vps : le backend doit avoir migré la base MariaDB"
$DCV up -d --wait --wait-timeout 120 certbot backup >/dev/null 2>&1
for _ in $(seq 1 20); do ls "${BACKUPS}/vps"/pyquest-*.sql.gz >/dev/null 2>&1 && break; sleep 1; done
gunzip -c "$(ls "${BACKUPS}/vps"/pyquest-*.sql.gz | head -n1)" | grep -q "django_migrations" || fail "vps : sauvegarde MariaDB absente ou invalide"
echo "docker : piles intranet et VPS ok"
