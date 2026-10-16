#!/usr/bin/env bash
# Installation du serveur PyQuest, À EXÉCUTER SUR LE VPS en root (sudo). Normalement lancé par scripts/vps_bootstrap.sh,
# qui envoie d'abord ce dossier, nginx/ et le code du backend. Idempotent : peut être relancé sans danger ; ne remplace
# jamais un fichier de configuration ou un secret déjà présent.
#
#   sudo bash remote_setup.sh --domain pyquest.example.org --deploy-user denis [--certbot adresse@mail] [--dry-run]
#
# Fait : paquets, utilisateur système, dossiers, environnement Python, fichier d'environnement (clé secrète générée),
# unité systemd, extraits et vhost nginx, certificat Let's Encrypt (si --certbot), droit de redémarrer le service.
# NE fait PAS : créer la base MariaDB, saisir son mot de passe, créer l'administrateur (étapes listées à la fin).
set -euo pipefail

DOMAIN=""
DEPLOY_USER=""
CERTBOT_EMAIL=""
DRY_RUN=0
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_SRC="${HERE}/../nginx"
WEB_ROOT="/var/www/pyquest"
APP_ROOT="/opt/pyquest"
ENV_FILE="/etc/pyquest/env"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="${2:-}"; shift 2 ;;
        --deploy-user) DEPLOY_USER="${2:-}"; shift 2 ;;
        --certbot) CERTBOT_EMAIL="${2:-}"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : $1" >&2; exit 2 ;;
    esac
done

[[ "${DOMAIN}" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "--domain invalide (ex. pyquest.example.org)" >&2; exit 2; }
[[ "${DEPLOY_USER}" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || { echo "--deploy-user invalide" >&2; exit 2; }
[[ -z "${CERTBOT_EMAIL}" || "${CERTBOT_EMAIL}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$ ]] || { echo "--certbot : adresse e-mail invalide" >&2; exit 2; }
[[ "${DRY_RUN}" == 1 || "${EUID}" -eq 0 ]] || { echo "À lancer en root : sudo bash $0 …" >&2; exit 1; }
id "${DEPLOY_USER}" >/dev/null 2>&1 || { [[ "${DRY_RUN}" == 1 ]] || { echo "L'utilisateur ${DEPLOY_USER} n'existe pas." >&2; exit 1; }; }

step() { printf '\n==> %s\n' "$*"; }
run() {
    if [[ "${DRY_RUN}" == 1 ]]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}
# Écrit un fichier depuis l'entrée standard, sauf s'il existe déjà (jamais d'écrasement de ta configuration).
install_new() { # chemin mode propriétaire:groupe
    if [[ -e "$1" ]]; then echo "déjà présent, conservé : $1"; cat >/dev/null; return; fi
    if [[ "${DRY_RUN}" == 1 ]]; then echo "[dry-run] création de $1"; cat >/dev/null; return; fi
    install -m "$2" -o "${3%%:*}" -g "${3##*:}" /dev/stdin "$1"
    echo "créé : $1"
}

step "Paquets (nginx, rsync, Python, bibliothèque cliente MariaDB, certbot)"
run apt-get update -qq
run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx rsync python3-venv python3-dev pkg-config libmariadb-dev build-essential certbot

step "Utilisateur système « pyquest » et dossiers"
getent passwd pyquest >/dev/null || run adduser --system --group --no-create-home --shell /usr/sbin/nologin pyquest
run mkdir -p "${WEB_ROOT}/releases" "${WEB_ROOT}/static" "${WEB_ROOT}/letsencrypt" "${APP_ROOT}/backend" /etc/pyquest
run chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${WEB_ROOT}/releases" "${APP_ROOT}/backend"
run chown pyquest:pyquest "${WEB_ROOT}/static"
run chown root:pyquest /etc/pyquest
run chmod 750 /etc/pyquest

step "Environnement Python du backend"
if [[ ! -d "${APP_ROOT}/venv" ]]; then run python3 -m venv "${APP_ROOT}/venv"; fi
if [[ -f "${APP_ROOT}/backend/requirements-prod.txt" || "${DRY_RUN}" == 1 ]]; then
    run "${APP_ROOT}/venv/bin/pip" install --quiet --upgrade pip
    run "${APP_ROOT}/venv/bin/pip" install --quiet -r "${APP_ROOT}/backend/requirements-prod.txt"
else
    echo "Code du backend absent de ${APP_ROOT}/backend : lance d'abord « make deploy-backend » (ou scripts/vps_bootstrap.sh)." >&2
    exit 1
fi

step "Fichier d'environnement ${ENV_FILE} (clé secrète générée, jamais écrasé)"
if [[ ! -e "${ENV_FILE}" ]]; then
    SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
    sed -e "s#__A_GENERER__#${SECRET}#" -e "s#pyquest.example.org#${DOMAIN}#g" "${HERE}/pyquest.env.example" | install_new "${ENV_FILE}" 640 root:pyquest
else
    echo "déjà présent, conservé : ${ENV_FILE}"
fi

step "Unité systemd"
install_new /etc/systemd/system/pyquest.service 644 root:root < "${HERE}/pyquest.service.example"
run systemctl daemon-reload

step "Droit de redémarrer le service (seule commande autorisée sans mot de passe)"
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] /etc/sudoers.d/pyquest : ${DEPLOY_USER} peut lancer « systemctl restart|status pyquest »"
else
    SUDOERS_TMP="$(mktemp)"
    printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl restart pyquest, /usr/bin/systemctl status pyquest\n' "${DEPLOY_USER}" > "${SUDOERS_TMP}"
    visudo -cf "${SUDOERS_TMP}" >/dev/null && install -m 440 -o root -g root "${SUDOERS_TMP}" /etc/sudoers.d/pyquest
    rm -f "${SUDOERS_TMP}"
fi

step "Script de sauvegarde de la base (${APP_ROOT}/scripts/backup_db.sh)"
if [[ -f "${HERE}/../scripts/backup_db.sh" || "${DRY_RUN}" == 1 ]]; then
    run install -d "${APP_ROOT}/scripts"
    run install -m 750 -o root -g root "${HERE}/../scripts/backup_db.sh" "${APP_ROOT}/scripts/backup_db.sh"
fi

step "nginx : extraits partagés"
run install -d /etc/nginx/snippets
run install -m 644 "${NGINX_SRC}/pyquest-locations.conf.example" /etc/nginx/snippets/pyquest-locations.conf
run install -m 644 "${NGINX_SRC}/pyquest-author-headers.conf.example" /etc/nginx/snippets/pyquest-author-headers.conf

VHOST=/etc/nginx/sites-available/pyquest
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
if [[ ! -e "${CERT_DIR}/fullchain.pem" && "${DRY_RUN}" == 0 ]]; then
    step "nginx : vhost HTTP provisoire (le certificat n'existe pas encore)"
    cat > "${VHOST}" <<CONF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root ${WEB_ROOT}/letsencrypt; }
    location / { return 200 "PyQuest : installation en cours\n"; add_header Content-Type text/plain; }
}
CONF
    ln -sfn "${VHOST}" /etc/nginx/sites-enabled/pyquest
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
    if [[ -n "${CERTBOT_EMAIL}" ]]; then
        step "Certificat Let's Encrypt pour ${DOMAIN}"
        certbot certonly --webroot -w "${WEB_ROOT}/letsencrypt" -d "${DOMAIN}" --non-interactive --agree-tos -m "${CERTBOT_EMAIL}"
    fi
fi
if [[ -e "${CERT_DIR}/fullchain.pem" || "${DRY_RUN}" == 1 ]]; then
    step "nginx : vhost complet (HTTPS, éditeur protégé, API, administration)"
    if [[ "${DRY_RUN}" == 1 ]]; then
        echo "[dry-run] vhost ${VHOST} pour ${DOMAIN}"
    else
        sed -e "s#pyquest.example.org#${DOMAIN}#g" -e "s#/var/www/pyquest/current#${WEB_ROOT}/current#" -e "s#/var/www/letsencrypt#${WEB_ROOT}/letsencrypt#" "${NGINX_SRC}/pyquest.conf.example" > "${VHOST}.new"
        mv "${VHOST}.new" "${VHOST}"
        ln -sfn "${VHOST}" /etc/nginx/sites-enabled/pyquest
        rm -f /etc/nginx/sites-enabled/default
        # Les zones limit_req_zone doivent être au niveau http : sites-enabled y est inclus, c'est bon.
        nginx -t && systemctl reload nginx
    fi
else
    echo "Pas de certificat : relance avec --certbot adresse@mail, ou obtiens-le toi-même, puis relance ce script."
fi

cat <<NEXT

==> Installation du serveur terminée. Restent, dans l'ordre :
  1. Base MariaDB : adapter puis exécuter deploy/mariadb-setup.sql.example (sudo mariadb < …), puis mettre le mot de
     passe dans ${ENV_FILE} (PYQUEST_DB_PASSWORD) — fichier lisible par root et le groupe pyquest seulement.
  2. Démarrer le service : sudo systemctl enable --now pyquest ; sudo systemctl status pyquest
     (il applique les migrations et collecte les fichiers statiques au démarrage).
  3. Premier administrateur : sudo -u pyquest env \$(grep -v '^#' ${ENV_FILE} | xargs) ${APP_ROOT}/venv/bin/python ${APP_ROOT}/backend/manage.py createsuperuser
  4. Depuis ta machine : make deploy (le site), puis make check-deploy URL=https://${DOMAIN}
  5. Sauvegarde quotidienne de la base : echo '30 3 * * *  root  ${APP_ROOT}/scripts/backup_db.sh' | sudo tee /etc/cron.d/pyquest-backup
NEXT
