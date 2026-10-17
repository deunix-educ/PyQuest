#!/usr/bin/env bash
# Installation du serveur PyQuest, À LANCER SUR LE VPS, EN ROOT, DEPUIS LE DÉPÔT CLONÉ (par ex. /opt/PyQuest) :
#
#   git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest     # ou l'adresse HTTPS
#   cd /opt/PyQuest && ./deploy/server_setup.sh --domain pyquest.example.org [--certbot adresse@mail] [--dry-run]
#
# Idempotent : peut être relancé sans danger ; ne remplace jamais un fichier de configuration ou un secret déjà
# présent. Commencer par --dry-run (n'écrit rien, affiche ce qui serait fait).
#
# Fait : paquets, utilisateur système « pyquest », dossiers, environnement Python du backend, fichier
# d'environnement (clé secrète générée), unité systemd, extraits et vhost nginx, certificat Let's Encrypt (--certbot).
# NE fait PAS : créer la base MariaDB, saisir son mot de passe, créer l'administrateur, publier le site
# (étapes listées à la fin ; le site se publie avec scripts/server_update.sh).
set -euo pipefail

DOMAIN=""
CERTBOT_EMAIL=""
DRY_RUN=0
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${HERE}/.." && pwd)"
NGINX_SRC="${REPO}/nginx"
WEB_ROOT="${PYQUEST_WEB_ROOT:-/var/www/pyquest}"
ENV_FILE="${PYQUEST_ENV_FILE:-/etc/pyquest/env}"
VENV="${REPO}/.venv-prod"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="${2:-}"; shift 2 ;;
        --certbot) CERTBOT_EMAIL="${2:-}"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : $1" >&2; exit 2 ;;
    esac
done

[[ "${DOMAIN}" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "--domain invalide (ex. pyquest.example.org)" >&2; exit 2; }
[[ -z "${CERTBOT_EMAIL}" || "${CERTBOT_EMAIL}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$ ]] || { echo "--certbot : adresse e-mail invalide" >&2; exit 2; }
[[ "${REPO}" =~ ^/[A-Za-z0-9_./-]+$ ]] || { echo "Le chemin du dépôt (${REPO}) ne doit contenir que des caractères simples." >&2; exit 2; }
[[ -f "${REPO}/backend/manage.py" ]] || { echo "${REPO} n'est pas un dépôt PyQuest (backend/manage.py introuvable)." >&2; exit 1; }
[[ "${DRY_RUN}" == 1 || "${EUID}" -eq 0 ]] || { echo "À lancer en root : ./deploy/server_setup.sh …" >&2; exit 1; }
# Le service tourne sous l'utilisateur « pyquest » : il doit pouvoir lire le dépôt (donc pas sous /root).
case "${REPO}" in /root|/root/*|/home|/home/*) echo "Clone le dépôt hors de /root et /home (par ex. /opt/PyQuest) : le service n'y aurait pas accès." >&2; exit 1 ;; esac

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

step "Paquets (nginx, git, make, curl, rsync, Python, bibliothèque cliente MariaDB, certbot)"
run apt-get update -qq
run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx git make curl bzip2 rsync python3 python3-venv python3-dev pkg-config libmariadb-dev build-essential certbot

step "Utilisateur système « pyquest » et dossiers"
getent passwd pyquest >/dev/null || run adduser --system --group --no-create-home --shell /usr/sbin/nologin pyquest
run mkdir -p "${WEB_ROOT}/releases" "${WEB_ROOT}/static" "${WEB_ROOT}/letsencrypt" "$(dirname "${ENV_FILE}")"
run chown pyquest:pyquest "${WEB_ROOT}/static"
run chown root:pyquest "$(dirname "${ENV_FILE}")"
run chmod 750 "$(dirname "${ENV_FILE}")"
if [[ "${DRY_RUN}" == 0 ]]; then
    # Le service (utilisateur pyquest) doit traverser les dossiers parents du dépôt et lire le code.
    runuser -u pyquest -- test -r "${REPO}/backend/manage.py" || { echo "L'utilisateur pyquest ne peut pas lire ${REPO}/backend : vérifier les droits (chmod o+rx sur les dossiers parents)." >&2; exit 1; }
fi

step "Environnement Python du backend (${VENV})"
if [[ ! -d "${VENV}" ]]; then run python3 -m venv "${VENV}"; fi
run "${VENV}/bin/pip" install --quiet --upgrade pip
run "${VENV}/bin/pip" install --quiet -r "${REPO}/backend/requirements-prod.txt"

step "Fichier d'environnement ${ENV_FILE} (clé secrète générée, jamais écrasé)"
if [[ ! -e "${ENV_FILE}" ]]; then
    SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
    sed -e "s#__A_GENERER__#${SECRET}#" -e "s#pyquest.example.org#${DOMAIN}#g" "${HERE}/pyquest.env.example" | install_new "${ENV_FILE}" 640 root:pyquest
else
    echo "déjà présent, conservé : ${ENV_FILE}"
fi

step "Unité systemd (chemins du dépôt : ${REPO})"
sed -e "s#/opt/PyQuest#${REPO}#g" "${HERE}/pyquest.service.example" | install_new /etc/systemd/system/pyquest.service 644 root:root
run systemctl daemon-reload

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
        # Les zones limit_req_zone sont au niveau http : sites-enabled y est inclus, c'est bon.
        nginx -t && systemctl reload nginx
    fi
else
    echo "Pas de certificat : relance avec --certbot adresse@mail, ou obtiens-le toi-même, puis relance ce script."
fi

cat <<NEXT

==> Installation du serveur terminée. Restent, dans l'ordre :
  1. Base MariaDB : adapter puis exécuter ${REPO}/deploy/mariadb-setup.sql.example (mariadb < …), puis mettre le mot de
     passe dans ${ENV_FILE} (PYQUEST_DB_PASSWORD).
  2. Démarrer le service : systemctl enable --now pyquest ; systemctl status pyquest
     (il applique les migrations et collecte les fichiers statiques au démarrage).
  3. Premier administrateur : cd ${REPO}/backend && set -a && . ${ENV_FILE} && set +a && ${VENV}/bin/python manage.py createsuperuser
  4. Publier le site : cd ${REPO} && ./scripts/server_update.sh
  5. Contrôler : ./scripts/check_deploy.sh https://${DOMAIN} ; ./scripts/vps_doctor.sh
  6. Sauvegarde quotidienne : echo '30 3 * * *  root  ${REPO}/scripts/backup_db.sh' > /etc/cron.d/pyquest-backup
NEXT
