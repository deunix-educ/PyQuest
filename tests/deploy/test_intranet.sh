#!/usr/bin/env bash
# Teste l'installation intranet sans root : autorité et certificat réels (openssl), vhost réel rendu comme
# l'installateur le fait, servi par un vrai nginx (PYQUEST_NGINX, nginx du PATH, ou .local/nginx de `make fetch-nginx`),
# interrogé par curl qui ne fait confiance qu'à l'autorité interne. Ignoré (code 0, message) si aucun nginx n'est disponible.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
NGINX_PID=""
cleanup() { [[ -z "${NGINX_PID}" ]] || kill "${NGINX_PID}" 2>/dev/null || true; rm -rf "${WORK}"; }
trap cleanup EXIT
fail() { echo "ÉCHEC : $1" >&2; exit 1; }

TLS="${WORK}/tls"
HOSTS="pyquest.lycee.local,127.0.0.1"

# ---- scripts/intranet_cert.sh --------------------------------------------------------------------------------------
"${ROOT}/scripts/intranet_cert.sh" --hosts "${HOSTS}" --dir "${TLS}" >/dev/null
[[ "$(stat -c %a "${TLS}/ca.key")" == 600 && "$(stat -c %a "${TLS}/server.key")" == 600 ]] || fail "les clés privées doivent être en 600"
san="$(openssl x509 -in "${TLS}/server.crt" -noout -ext subjectAltName)"
echo "${san}" | grep -q "DNS:pyquest.lycee.local" || fail "le nom DNS manque dans le certificat"
echo "${san}" | grep -q "IP Address:127.0.0.1" || fail "l'adresse IP manque dans le certificat"
openssl verify -CAfile "${TLS}/ca.crt" "${TLS}/server.crt" >/dev/null || fail "le certificat doit être signé par l'autorité"
openssl x509 -in "${TLS}/server.crt" -noout -ext extendedKeyUsage | grep -q "TLS Web Server" || fail "usage serveur TLS attendu"
ca_before="$(sha256sum "${TLS}/ca.crt")"
out="$("${ROOT}/scripts/intranet_cert.sh" --hosts "${HOSTS}" --dir "${TLS}" --if-needed)"
echo "${out}" | grep -q "à jour" || fail "--if-needed ne doit rien réémettre quand tout est valide"
serial_before="$(openssl x509 -in "${TLS}/server.crt" -noout -serial)"
out="$("${ROOT}/scripts/intranet_cert.sh" --hosts "${HOSTS},autre.lan" --dir "${TLS}" --if-needed)"
echo "${out}" | grep -q "RELOAD_NEEDED" || fail "un nom ajouté doit réémettre le certificat"
[[ "$(openssl x509 -in "${TLS}/server.crt" -noout -serial)" != "${serial_before}" ]] || fail "le numéro de série doit changer"
[[ "$(sha256sum "${TLS}/ca.crt")" == "${ca_before}" ]] || fail "l'autorité ne doit jamais changer à la réémission"
"${ROOT}/scripts/intranet_cert.sh" --hosts "bad host" --dir "${TLS}" >/dev/null 2>&1 && fail "un nom invalide doit être refusé"
"${ROOT}/scripts/intranet_cert.sh" --hosts "${HOSTS}" --dir "${TLS}" >/dev/null   # revient à la liste d'origine

# ---- installateurs : arguments et --dry-run ------------------------------------------------------------------------
INTRA="${ROOT}/deploy/install_intranet.sh"
"${INTRA}" --host "pas valide" --dry-run --yes >/dev/null 2>&1 && fail "hôte invalide accepté"
"${INTRA}" --host x.lan --port 80 --dry-run --yes >/dev/null 2>&1 && fail "port privilégié accepté"
"${INTRA}" --host x.lan --yes >/dev/null 2>&1 && fail "doit exiger root hors --dry-run"
out="$("${INTRA}" --host pyquest.lycee.local,10.0.0.5 --dry-run --yes 2>&1)"
for needle in "apt-get install" "intranet_cert.sh --hosts pyquest.lycee.local,10.0.0.5" "pyquest-cert" "requirements-server.txt" "systemctl enable --now pyquest" "server_update.sh" "http://pyquest.lycee.local/ca"; do
    echo "${out}" | grep -q -- "${needle}" || fail "install_intranet --dry-run doit mentionner : ${needle}"
done
echo "${out}" | grep -qi "mariadb\|certbot" && fail "l'installation intranet ne doit utiliser ni MariaDB ni certbot"
VPS="${ROOT}/deploy/install_vps.sh"
"${VPS}" --domain "pas un domaine" --dry-run --yes >/dev/null 2>&1 && fail "domaine invalide accepté"
"${VPS}" --domain pyquest.example.org --email nope --dry-run --yes >/dev/null 2>&1 && fail "e-mail invalide accepté"
"${VPS}" --domain pyquest.example.org --email a@b.fr --yes >/dev/null 2>&1 && fail "doit exiger root hors --dry-run"
"${VPS}" --email a@b.fr --yes --dry-run >/dev/null 2>&1 && fail "--yes sans --domain doit échouer (aucune question possible)"
out="$("${VPS}" --domain pyquest.example.org --email a@b.fr --dry-run --yes 2>&1)"
for needle in "server_setup.sh\|certbot" "db_setup.sh" "systemctl enable --now pyquest" "server_update.sh" "pyquest-backup" "createsuperuser"; do
    echo "${out}" | grep -q -- "${needle}" || fail "install_vps --dry-run doit mentionner : ${needle}"
done
echo "${out}" | grep -q "Restent, dans l'ordre" && fail "l'installateur ne doit pas répéter la liste d'étapes manuelles de server_setup.sh"

# ---- vhost rendu + vrai nginx --------------------------------------------------------------------------------------
NGINX="${PYQUEST_NGINX:-$(command -v nginx || true)}"
[[ -n "${NGINX}" ]] || NGINX="${ROOT}/.local/nginx/root/usr/sbin/nginx"
if [[ ! -x "${NGINX}" ]]; then echo "intranet : certificats et installateurs ok (nginx absent : essai du vhost ignoré, make fetch-nginx)"; exit 0; fi

HTTP_PORT=18080; HTTPS_PORT=18443
while ss -ltnH | awk '{print $4}' | grep -qE "[:.](${HTTP_PORT}|${HTTPS_PORT})\$"; do HTTP_PORT=$((HTTP_PORT + 10)); HTTPS_PORT=$((HTTPS_PORT + 10)); done
SITE="${WORK}/www"
mkdir -p "${SITE}/current" "${SITE}/ca" "${SITE}/static" "${WORK}/conf/snippets" "${WORK}/logs"
echo "<!doctype html><title>PyQuest</title>" > "${SITE}/current/index.html"
cp "${TLS}/ca.crt" "${SITE}/ca/pyquest-ca.crt"
cp "${ROOT}/deploy/intranet-ca.html" "${SITE}/ca/index.html"
sed -e "s#127.0.0.1:8001#127.0.0.1:9#g" -e "s#/var/www/pyquest/static#${SITE}/static#" "${ROOT}/nginx/pyquest-locations.conf.example" > "${WORK}/conf/snippets/pyquest-locations.conf"
cp "${ROOT}/nginx/pyquest-author-headers.conf.example" "${WORK}/conf/snippets/pyquest-author-headers.conf"
vhost="$(sed -e "s#__SERVER_NAMES__#pyquest.lycee.local 127.0.0.1#" -e "s#__WEB_ROOT__#${SITE}#g" -e "s#__TLS_DIR__#${TLS}#g" \
    -e "s#listen 80 default_server#listen ${HTTP_PORT} default_server#; s#listen \[::\]:80 default_server#listen [::1]:${HTTP_PORT} default_server#" \
    -e "s#listen 443 ssl default_server#listen ${HTTPS_PORT} ssl default_server#; s#listen \[::\]:443 ssl default_server#listen [::1]:${HTTPS_PORT} ssl default_server#" \
    -e "s#https://\$host\$request_uri#https://\$host:${HTTPS_PORT}\$request_uri#" "${ROOT}/nginx/pyquest-intranet.conf.example")"
cat > "${WORK}/conf/nginx.conf" <<CONF
pid ${WORK}/nginx.pid;
error_log ${WORK}/logs/error.log;
events {}
http {
    access_log off;
    client_body_temp_path ${WORK}/tmp/body; proxy_temp_path ${WORK}/tmp/proxy; fastcgi_temp_path ${WORK}/tmp/fcgi; uwsgi_temp_path ${WORK}/tmp/uwsgi; scgi_temp_path ${WORK}/tmp/scgi;
${vhost}
}
CONF
mkdir -p "${WORK}/tmp"
"${NGINX}" -p "${WORK}" -c "${WORK}/conf/nginx.conf" -t >/dev/null 2>"${WORK}/test.log" || { cat "${WORK}/test.log" >&2; fail "nginx -t refuse le vhost rendu"; }
"${NGINX}" -p "${WORK}" -c "${WORK}/conf/nginx.conf" -g 'daemon off;' >/dev/null 2>&1 &
NGINX_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:${HTTP_PORT}/" && break; sleep 0.2; done

by_name=(--cacert "${TLS}/ca.crt" --resolve "pyquest.lycee.local:${HTTPS_PORT}:127.0.0.1")
[[ "$(curl -s -o /dev/null -w '%{http_code}' "${by_name[@]}" "https://pyquest.lycee.local:${HTTPS_PORT}/")" == 200 ]] || fail "le site doit répondre 200 en HTTPS par son nom"
[[ "$(curl -s -o /dev/null -w '%{http_code}' --cacert "${TLS}/ca.crt" "https://127.0.0.1:${HTTPS_PORT}/")" == 200 ]] || fail "le site doit répondre en HTTPS par l'adresse IP (SAN IP)"
curl -s -o /dev/null "https://127.0.0.1:${HTTPS_PORT}/" 2>/dev/null && fail "sans confiance dans l'autorité, la connexion doit être refusée"
headers="$(curl -sI "${by_name[@]}" "https://pyquest.lycee.local:${HTTPS_PORT}/" | tr -d '\r')"
echo "${headers}" | grep -qi '^cross-origin-opener-policy: same-origin' || fail "COOP manquant"
echo "${headers}" | grep -qi '^cross-origin-embedder-policy: require-corp' || fail "COEP manquant"
http="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "http://127.0.0.1:${HTTP_PORT}/")"
[[ "${http}" == "301 https://127.0.0.1:${HTTPS_PORT}/" ]] || fail "HTTP doit rediriger vers HTTPS (reçu : ${http})"
curl -s "http://127.0.0.1:${HTTP_PORT}/pyquest-ca.crt" | cmp -s - "${TLS}/ca.crt" || fail "/pyquest-ca.crt doit servir l'autorité en HTTP"
[[ "$(curl -sI "http://127.0.0.1:${HTTP_PORT}/pyquest-ca.crt" | tr -d '\r' | grep -ci 'content-type: application/x-x509-ca-cert')" == 1 ]] || fail "type MIME du certificat"
curl -s "http://127.0.0.1:${HTTP_PORT}/ca" | grep -q "pyquest-ca.crt" || fail "la page /ca doit proposer le téléchargement"
[[ "$(curl -s -o /dev/null -w '%{http_code}' "${by_name[@]}" "https://pyquest.lycee.local:${HTTPS_PORT}/api/auth/check/")" == 404 ]] || fail "/api/auth/check/ doit rester interne (404)"
echo "intranet : certificats, installateurs et vhost (vrai nginx) : ok"
