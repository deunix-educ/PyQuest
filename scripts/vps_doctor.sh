#!/usr/bin/env bash
# Diagnostic en LECTURE SEULE d'un serveur PyQuest, à lancer SUR LE VPS (de préférence en root) depuis le dépôt cloné :
#   cd /opt/PyQuest && ./scripts/vps_doctor.sh
# Ne modifie rien et n'affiche aucun secret. Utile pour reprendre un déploiement.
set -uo pipefail

FAILED=0
REPO="${PYQUEST_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)}"
[[ -f "${REPO}/backend/manage.py" ]] || REPO=/opt/PyQuest
VENV="${REPO}/.venv-prod"
PORT="$(grep -E '^PYQUEST_PORT=' /etc/pyquest/env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
PORT="${PORT:-8001}"
# Django n'accepte que le domaine de PYQUEST_ALLOWED_HOSTS et redirige vers HTTPS sans l'en-tête du proxy : on se présente
# comme nginx (Host et X-Forwarded-Proto), sinon la réponse serait 400 ou 301 même quand tout fonctionne.
SITE_HOST="$(grep -E '^PYQUEST_ALLOWED_HOSTS=' /etc/pyquest/env 2>/dev/null | tail -n1 | cut -d= -f2- | cut -d, -f1 || true)"
SITE_HOST="${SITE_HOST:-localhost}"
api() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: ${SITE_HOST}" -H 'X-Forwarded-Proto: https' "$@"; }
ok() { printf '  ok     %s\n' "$1"; }
ko() { printf '  ÉCHEC  %s\n' "$1"; FAILED=1; }
info() { printf '  info   %s\n' "$1"; }
can_sudo() { sudo -n true 2>/dev/null; }
as_root() { if [[ "${EUID}" -eq 0 ]]; then "$@"; elif can_sudo; then sudo -n "$@"; else return 126; fi; }

echo "Système"
info "$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-inconnu}") — $(uname -r)"
info "disque libre sur / : $(df -h / | awk 'NR==2 {print $4}')"

echo "nginx"
if command -v nginx >/dev/null; then
    version="$(nginx -v 2>&1 | sed 's/.*nginx\///')"
    ok "nginx ${version}"
    major="${version%%.*}"; minor="$(echo "${version}" | cut -d. -f2)"
    if (( major > 1 || (major == 1 && minor >= 25) )); then ok "http2 on; pris en charge"; else info "nginx < 1.25.1 : utiliser « listen 443 ssl http2; »"; fi
    if as_root nginx -t >/dev/null 2>&1; then ok "configuration valide (nginx -t)"; else info "nginx -t non vérifiable ou en échec (droits root requis) : lance « nginx -t »"; fi
    systemctl is-active --quiet nginx && ok "service nginx actif" || ko "service nginx inactif"
else
    ko "nginx n'est pas installé"
fi
[[ -f /etc/nginx/snippets/pyquest-locations.conf ]] && ok "extrait pyquest-locations.conf installé" || ko "extrait /etc/nginx/snippets/pyquest-locations.conf manquant"
[[ -f /etc/nginx/snippets/pyquest-author-headers.conf ]] && ok "extrait pyquest-author-headers.conf installé" || ko "extrait pyquest-author-headers.conf manquant"

echo "Site statique"
WEB="${PYQUEST_WEB_ROOT:-/var/www/pyquest}"
if [[ -L "${WEB}/current" ]]; then
    ok "current -> $(readlink "${WEB}/current")"
    [[ -f "${WEB}/current/index.html" ]] && ok "index.html présent" || ko "index.html absent dans current"
    [[ -f "${WEB}/current/vendor/pyodide/pyodide.asm.wasm" ]] && ok "moteur Python (Pyodide) présent" || ko "Pyodide absent : ./scripts/server_update.sh"
    info "versions conservées : $(ls -1 "${WEB}/releases" 2>/dev/null | wc -l)"
else
    ko "${WEB}/current absent : site non publié (./scripts/server_update.sh)"
fi
[[ -d "${WEB}/static/admin" ]] && ok "fichiers statiques de l'administration présents" || info "statiques de l'administration absents (créés au démarrage du service)"

echo "Backend Django"
[[ -x "${VENV}/bin/gunicorn" ]] && ok "environnement Python et gunicorn installés" || ko "${VENV}/bin/gunicorn manquant (./deploy/server_setup.sh)"
[[ -f "${REPO}/backend/manage.py" ]] && ok "dépôt cloné : ${REPO}" || ko "dépôt introuvable (git clone … /opt/PyQuest)"
if git -C "${REPO}" rev-parse --short HEAD >/dev/null 2>&1; then info "version du dépôt : $(git -C "${REPO}" rev-parse --short HEAD) ($(git -C "${REPO}" log -1 --format=%cd --date=short))"; fi
if [[ -f /etc/pyquest/env ]]; then
    perms="$(stat -c '%a %U:%G' /etc/pyquest/env)"
    ok "/etc/pyquest/env présent (${perms})"
    case "${perms%% *}" in 600|640|400|440) ok "droits du fichier d'environnement stricts" ;; *) ko "droits trop larges sur /etc/pyquest/env (attendu 640 root:pyquest)" ;; esac
    if as_root grep -q '__A_REMPLIR__\|__A_GENERER__' /etc/pyquest/env 2>/dev/null; then ko "valeurs à remplir dans /etc/pyquest/env (mot de passe de la base ?)"; fi
else
    ko "/etc/pyquest/env absent"
fi
if systemctl is-active --quiet pyquest 2>/dev/null; then
    ok "service pyquest actif (port ${PORT})"
    # Un jeton au bon format interroge la base : 404 = base joignable, 500 = base en panne.
    code="$(api -H 'Authorization: Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' "http://127.0.0.1:${PORT}/api/sync/")"
    case "${code}" in
        404) ok "API répond et la base de données est joignable (404 attendu)" ;;
        500) ko "l'API répond 500 : base de données injoignable ? (journalctl -u pyquest)" ;;
        400) ko "l'API répond 400 : le domaine « ${SITE_HOST} » n'est pas accepté (PYQUEST_ALLOWED_HOSTS dans /etc/pyquest/env)" ;;
        *) info "API répond ${code}" ;;
    esac
    [[ "$(api "http://127.0.0.1:${PORT}/api/auth/check/")" == 401 ]] && ok "contrôle d'accès de l'éditeur répond (401 sans session)" || ko "/api/auth/check/ ne répond pas 401"
else
    ko "service pyquest inactif (systemctl enable --now pyquest ; journalctl -u pyquest -n 50)"
fi

ENGINE="$(grep -E '^PYQUEST_DB_ENGINE=' /etc/pyquest/env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
TLS_MODE="$(grep -E '^PYQUEST_TLS=' /etc/pyquest/env 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
echo "Base de données"
if [[ "${ENGINE}" == sqlite ]]; then
    DB_PATH="$(grep -E '^PYQUEST_DB_PATH=' /etc/pyquest/env | tail -n1 | cut -d= -f2-)"
    if [[ -f "${DB_PATH}" ]]; then ok "base SQLite présente (${DB_PATH}, $(du -h "${DB_PATH}" | cut -f1))"; else ko "base SQLite absente : ${DB_PATH} (créée au démarrage du service)"; fi
    ls /var/backups/pyquest/pyquest-*.sqlite.gz >/dev/null 2>&1 && ok "sauvegarde la plus récente : $(ls -1 /var/backups/pyquest/pyquest-*.sqlite.gz | sort | tail -n1)" || info "aucune sauvegarde dans /var/backups/pyquest (cron : /etc/cron.d/pyquest-backup)"
elif command -v mariadb >/dev/null || command -v mysql >/dev/null; then
    ok "client MariaDB/MySQL présent"
    systemctl is-active --quiet mariadb 2>/dev/null && ok "service mariadb actif" || info "service mariadb non local ou inactif"
else
    info "pas de client MariaDB/MySQL (base distante ?)"
fi

echo "Certificat"
if [[ "${TLS_MODE}" == internal ]]; then
    TLS_DIR="$(grep -E '^PYQUEST_TLS_DIR=' /etc/pyquest/env | tail -n1 | cut -d= -f2-)"
    TLS_DIR="${TLS_DIR:-/etc/pyquest/tls}"
    if as_root test -r "${TLS_DIR}/server.crt"; then
        if as_root openssl verify -CAfile "${TLS_DIR}/ca.crt" "${TLS_DIR}/server.crt" >/dev/null 2>&1; then ok "certificat du serveur signé par l'autorité interne"; else ko "le certificat du serveur n'est pas signé par ${TLS_DIR}/ca.crt"; fi
        if as_root openssl x509 -checkend $((30 * 86400)) -noout -in "${TLS_DIR}/server.crt" >/dev/null 2>&1; then
            ok "certificat du serveur valide encore plus de 30 jours"
        else
            ko "certificat du serveur expiré ou proche de l'expiration : ${REPO}/scripts/intranet_cert.sh --hosts $(as_root cat "${TLS_DIR}/hosts.txt" 2>/dev/null) --dir ${TLS_DIR} puis systemctl reload nginx"
        fi
        as_root openssl x509 -checkend $((365 * 86400)) -noout -in "${TLS_DIR}/ca.crt" >/dev/null 2>&1 && ok "autorité interne valide plus d'un an" || info "l'autorité interne expire dans moins d'un an : prévoir son remplacement (et la reconfiguration des postes)"
    else
        info "certificat de l'autorité interne non lisible sans root (${TLS_DIR})"
    fi
    [[ -f /etc/cron.d/pyquest-cert ]] && ok "renouvellement mensuel du certificat planifié (cron)" || ko "tâche /etc/cron.d/pyquest-cert absente : relancer ./deploy/install_intranet.sh"
    [[ -f "${WEB}/ca/pyquest-ca.crt" ]] && ok "certificat de l'autorité téléchargeable (/pyquest-ca.crt)" || ko "${WEB}/ca/pyquest-ca.crt absent"
    echo
    if [[ "${FAILED}" == 0 ]]; then echo "Aucun problème détecté."; else echo "Des points demandent une action (lignes ÉCHEC)." >&2; fi
    exit "${FAILED}"
fi
domain="${SITE_HOST}"
[[ -d "/etc/letsencrypt/live/${domain}" ]] || domain="$(ls /etc/letsencrypt/live 2>/dev/null | grep -v README | head -n1 || true)"
if [[ -n "${domain}" ]]; then
    end="$(as_root openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${domain}/fullchain.pem" 2>/dev/null | cut -d= -f2)"
    if [[ -n "${end}" ]]; then
        days=$(( ( $(date -d "${end}" +%s) - $(date +%s) ) / 86400 ))
        (( days > 14 )) && ok "certificat ${domain} valide encore ${days} jours" || ko "certificat ${domain} expire dans ${days} jours"
    else
        info "certificat ${domain} non lisible sans root"
    fi
    if [[ -f "/etc/letsencrypt/renewal/${domain}.conf" ]]; then
        ok "configuration de renouvellement certbot présente pour ${domain}"
    else
        ko "pas de configuration de renouvellement pour ${domain} (certificat obtenu hors certbot ?) : voir la documentation, section certificat"
    fi
    if systemctl is-active --quiet certbot.timer 2>/dev/null || [[ -f /etc/cron.d/certbot ]]; then
        ok "renouvellement automatique du certificat (certbot.timer ou cron)"
    else
        ko "renouvellement automatique absent : « systemctl enable --now certbot.timer » (puis « certbot renew --dry-run » pour tester)"
    fi
    [[ -x /etc/letsencrypt/renewal-hooks/deploy/pyquest-reload-nginx ]] && ok "nginx rechargé après chaque renouvellement" || ko "hook de rechargement nginx absent : relancer ./deploy/server_setup.sh --domain ${domain}"
else
    info "aucun certificat Let's Encrypt trouvé"
fi

echo
if [[ "${FAILED}" == 0 ]]; then echo "Aucun problème détecté."; else echo "Des points demandent une action (lignes ÉCHEC)." >&2; fi
exit "${FAILED}"
