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
# Port local du backend (--port) : par défaut le premier port libre à partir de 8001, ou celui déjà enregistré dans
# /etc/pyquest/env (PYQUEST_PORT) ; nginx et le service l'utilisent tous deux.
# NE fait PAS : créer la base MariaDB, saisir son mot de passe, créer l'administrateur, publier le site
# (étapes listées à la fin ; le site se publie avec scripts/server_update.sh).
set -euo pipefail

DOMAIN=""
CERTBOT_EMAIL=""
PORT=""
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
        --port) PORT="${2:-}"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) sed -n '2,16p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : $1" >&2; exit 2 ;;
    esac
done

[[ "${DOMAIN}" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "--domain invalide (ex. pyquest.example.org)" >&2; exit 2; }
[[ -z "${CERTBOT_EMAIL}" || "${CERTBOT_EMAIL}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$ ]] || { echo "--certbot : adresse e-mail invalide" >&2; exit 2; }
[[ -z "${PORT}" || ( "${PORT}" =~ ^[0-9]{2,5}$ && "${PORT}" -ge 1024 && "${PORT}" -le 65535 ) ]] || { echo "--port invalide (1024 à 65535)" >&2; exit 2; }
[[ "${REPO}" =~ ^/[A-Za-z0-9_./-]+$ ]] || { echo "Le chemin du dépôt (${REPO}) ne doit contenir que des caractères simples." >&2; exit 2; }
[[ -f "${REPO}/backend/manage.py" ]] || { echo "${REPO} n'est pas un dépôt PyQuest (backend/manage.py introuvable)." >&2; exit 1; }
[[ "${DRY_RUN}" == 1 || "${EUID}" -eq 0 ]] || { echo "À lancer en root : ./deploy/server_setup.sh …" >&2; exit 1; }
# Le service tourne sous l'utilisateur « pyquest » : il doit pouvoir lire le dépôt (donc pas sous /root).
case "${REPO}" in /root|/root/*|/home|/home/*) echo "Clone le dépôt hors de /root et /home (par ex. /opt/PyQuest) : le service n'y aurait pas accès." >&2; exit 1 ;; esac

port_in_use() { ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"; }

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

step "Port local du backend"
if [[ -z "${PORT}" && -r "${ENV_FILE}" ]]; then
    PORT="$(grep -E '^PYQUEST_PORT=' "${ENV_FILE}" | tail -n1 | cut -d= -f2- || true)"
    [[ "${PORT}" =~ ^[0-9]{2,5}$ ]] || PORT=""
    [[ -z "${PORT}" ]] || echo "port déjà enregistré dans ${ENV_FILE} : ${PORT}"
fi
if [[ -z "${PORT}" ]]; then
    PORT=8001
    while port_in_use "${PORT}"; do echo "port ${PORT} déjà utilisé sur ce serveur"; PORT=$((PORT + 1)); done
    echo "port choisi : ${PORT}"
elif [[ "${DRY_RUN}" == 0 ]] && ! systemctl is-active --quiet pyquest 2>/dev/null && port_in_use "${PORT}"; then
    # Un port imposé (ou mémorisé) qui est occupé par autre chose que PyQuest bloquerait le démarrage du service.
    echo "Le port ${PORT} est déjà utilisé par un autre programme : choisis-en un autre avec --port." >&2
    exit 1
fi

step "Fichier d'environnement ${ENV_FILE} (clé secrète générée, jamais écrasé)"
if [[ ! -e "${ENV_FILE}" ]]; then
    SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
    sed -e "s#__A_GENERER__#${SECRET}#" -e "s#pyquest.example.org#${DOMAIN}#g" "${HERE}/pyquest.env.example" | install_new "${ENV_FILE}" 640 root:pyquest
else
    echo "déjà présent, conservé : ${ENV_FILE}"
fi
# Le port est la seule valeur que ce script maintient dans un fichier existant (ajout ou mise à jour d'une ligne).
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] PYQUEST_PORT=${PORT} dans ${ENV_FILE}"
elif ! grep -qE "^PYQUEST_PORT=${PORT}\$" "${ENV_FILE}"; then
    TMP_ENV="$(mktemp)"
    grep -vE '^PYQUEST_PORT=' "${ENV_FILE}" > "${TMP_ENV}" || true
    printf 'PYQUEST_PORT=%s\n' "${PORT}" >> "${TMP_ENV}"
    cat "${TMP_ENV}" > "${ENV_FILE}"
    rm -f "${TMP_ENV}"
    echo "PYQUEST_PORT=${PORT} enregistré dans ${ENV_FILE}"
fi

step "Unité systemd (chemins du dépôt : ${REPO})"
# L'unité est gérée par ce dépôt (chemins et durcissement) : elle est réécrite à chaque exécution.
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] écriture de /etc/systemd/system/pyquest.service"
else
    sed -e "s#/opt/PyQuest#${REPO}#g" "${HERE}/pyquest.service.example" > /etc/systemd/system/pyquest.service
    chmod 644 /etc/systemd/system/pyquest.service
fi
run systemctl daemon-reload

step "nginx : extraits partagés"
run install -d /etc/nginx/snippets
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] /etc/nginx/snippets/pyquest-locations.conf (backend sur 127.0.0.1:${PORT})"
else
    sed -e "s#127.0.0.1:8001#127.0.0.1:${PORT}#g" "${NGINX_SRC}/pyquest-locations.conf.example" > /etc/nginx/snippets/pyquest-locations.conf
    chmod 644 /etc/nginx/snippets/pyquest-locations.conf
fi
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

step "Renouvellement automatique du certificat (certbot)"
HOOK_DIR=/etc/letsencrypt/renewal-hooks/deploy
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] hook ${HOOK_DIR}/pyquest-reload-nginx (recharge nginx après chaque renouvellement)"
    echo "[dry-run] systemctl enable --now certbot.timer (si l'unité existe)"
else
    # Sans rechargement, nginx continuerait de servir l'ancien certificat jusqu'à son expiration.
    install -d "${HOOK_DIR}"
    printf '#!/bin/sh\nsystemctl reload nginx\n' > "${HOOK_DIR}/pyquest-reload-nginx"
    chmod 755 "${HOOK_DIR}/pyquest-reload-nginx"
    if systemctl list-unit-files certbot.timer >/dev/null 2>&1 && systemctl list-unit-files certbot.timer | grep -q certbot.timer; then
        systemctl enable --now certbot.timer
        echo "minuteur certbot actif : $(systemctl is-active certbot.timer)"
    elif [[ -f /etc/cron.d/certbot ]]; then
        echo "renouvellement par cron (/etc/cron.d/certbot)"
    else
        echo "ATTENTION : ni minuteur ni cron certbot trouvés : le certificat ne se renouvellera pas tout seul." >&2
    fi
    if [[ -e "${CERT_DIR}/fullchain.pem" && ! -e "/etc/letsencrypt/renewal/${DOMAIN}.conf" ]]; then
        echo "ATTENTION : le certificat de ${DOMAIN} n'a pas de configuration de renouvellement certbot (obtenu autrement ?)." >&2
        echo "  Pour qu'il se renouvelle : certbot certonly --webroot -w ${WEB_ROOT}/letsencrypt -d ${DOMAIN} --keep-until-expiring --agree-tos -m adresse@mail" >&2
    fi
    echo "Essai à blanc du renouvellement : certbot renew --dry-run"
fi

if [[ "${DRY_RUN}" == 0 ]] && systemctl is-active --quiet pyquest 2>/dev/null; then
    step "Redémarrage du service (le port ou l'unité a pu changer)"
    systemctl restart pyquest
fi

# Lancé par deploy/install_vps.sh, qui enchaîne lui-même les étapes suivantes : pas de rappel.
[[ -z "${PYQUEST_FROM_INSTALLER:-}" ]] || exit 0
cat <<NEXT

==> Installation du serveur terminée. Restent, dans l'ordre :
  1. Base MariaDB : ./deploy/db_setup.sh (demande le mot de passe administrateur de MariaDB, crée la base et
     l'utilisateur, génère le mot de passe et l'écrit dans ${ENV_FILE}). Autre compte : --admin-user nom.
  2. Démarrer le service : systemctl enable --now pyquest ; systemctl status pyquest
     (il applique les migrations et collecte les fichiers statiques au démarrage).
  3. Premier administrateur : cd ${REPO}/backend && set -a && . ${ENV_FILE} && set +a && ${VENV}/bin/python manage.py createsuperuser
  4. Publier le site : cd ${REPO} && ./scripts/server_update.sh
  5. Contrôler : ./scripts/check_deploy.sh https://${DOMAIN} ; ./scripts/vps_doctor.sh
  6. Sauvegarde quotidienne : echo '30 3 * * *  root  ${REPO}/scripts/backup_db.sh' > /etc/cron.d/pyquest-backup
NEXT
