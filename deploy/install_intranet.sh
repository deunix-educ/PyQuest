#!/usr/bin/env bash
# Installateur PyQuest pour un RÉSEAU INTRANET (lycée, établissement) : un serveur Debian/Ubuntu du réseau, sans nom de
# domaine public. À LANCER EN ROOT SUR LE SERVEUR, DEPUIS LE DÉPÔT CLONÉ (par ex. /opt/PyQuest) :
#
#   git clone <adresse du dépôt> /opt/PyQuest && cd /opt/PyQuest
#   ./deploy/install_intranet.sh --host pyquest.lycee.local,192.168.1.20 [--dry-run]
#
# Fait, d'un bout à l'autre : paquets (nginx, openssl, Python…), utilisateur « pyquest », autorité de certification
# interne et certificat HTTPS du serveur (renouvelé chaque mois si besoin), base SQLite (un simple fichier, rien à
# administrer), service systemd, nginx (HTTPS, éditeur de niveaux protégé, administration), premier administrateur,
# publication du site, sauvegarde quotidienne, contrôle final. Idempotent : relançable sans danger.
#
# --host noms,adresses   noms DNS et/ou adresses IPv4 par lesquels les postes joignent le serveur (demandé sinon)
# --port N               port local du backend (défaut : premier port libre à partir de 8001)
# --no-admin             ne pas créer l'administrateur maintenant (./scripts/server_manage.sh createsuperuser plus tard)
# --yes                  ne pose aucune question (--host obligatoire, administrateur à créer à part)
# --dry-run              affiche ce qui serait fait sans rien modifier
#
# Prérequis réseau : le serveur doit joindre Internet pendant l'installation (paquets, moteur Python Pyodide, une fois) ;
# ensuite les postes n'ont besoin que du serveur. Les noms choisis doivent être résolus par le DNS du réseau (ou on
# utilise l'adresse IP). Les postes doivent faire confiance à l'autorité interne : page http://<serveur>/ca.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${HERE}/.." && pwd)"
HOSTS=""
PORT=""
CREATE_ADMIN=1
ASSUME_YES=0
DRY_RUN=0
WEB_ROOT=/var/www/pyquest
ENV_FILE="${PYQUEST_ENV_FILE:-/etc/pyquest/env}"
TLS_DIR=/etc/pyquest/tls
DATA_DIR=/var/lib/pyquest
VENV="${REPO}/.venv-prod"
# shellcheck source=deploy/lib.sh
. "${HERE}/lib.sh"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --host) HOSTS="${2:-}"; shift 2 ;;
        --port) PORT="${2:-}"; shift 2 ;;
        --no-admin) CREATE_ADMIN=0; shift ;;
        --yes) ASSUME_YES=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) sed -n '2,22p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : $1" >&2; exit 2 ;;
    esac
done

require_root
check_repo_location "${REPO}"
[[ -z "${PORT}" || ( "${PORT}" =~ ^[0-9]{2,5}$ && "${PORT}" -ge 1024 && "${PORT}" -le 65535 ) ]] || die "--port invalide (1024 à 65535)"
[[ "${DRY_RUN}" == 1 ]] || check_os

# ---- noms et adresses du serveur -------------------------------------------------------------------------------------
default_hosts="$(hostname -f 2>/dev/null || hostname)"
ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
[[ -z "${ip}" ]] || default_hosts="${default_hosts},${ip}"
ask HOSTS "Noms ou adresses IP du serveur, séparés par des virgules" "${default_hosts}"
HOSTS="${HOSTS//, /,}"
IFS=, read -r -a HOST_LIST <<< "${HOSTS}"
[[ ${#HOST_LIST[@]} -ge 1 ]] || die "--host : au moins un nom ou une adresse"
ORIGINS=""; NAMES=""
for host in "${HOST_LIST[@]}"; do
    if [[ ! "${host}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ && ! "${host}" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then die "nom ou adresse invalide : ${host}"; fi
    ORIGINS+="https://${host},"; NAMES+="${host} "
done
ORIGINS="${ORIGINS%,}"; NAMES="${NAMES% }"
echo "Le site sera joignable par : ${NAMES// /, }"

# ---- paquets, utilisateur, dossiers ----------------------------------------------------------------------------------
step "Paquets (nginx, openssl, git, rsync, Python, cron)"
run apt-get update -qq
run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx openssl git make curl bzip2 rsync python3 python3-venv cron ca-certificates

step "Utilisateur système « pyquest » et dossiers"
getent passwd pyquest >/dev/null || run adduser --system --group --no-create-home --shell /usr/sbin/nologin pyquest
run mkdir -p "${WEB_ROOT}/releases" "${WEB_ROOT}/static" "${WEB_ROOT}/ca" "${DATA_DIR}" "$(dirname "${ENV_FILE}")"
run chown pyquest:pyquest "${WEB_ROOT}/static" "${DATA_DIR}"
run chmod 750 "${DATA_DIR}"
run chown root:pyquest "$(dirname "${ENV_FILE}")"
run chmod 750 "$(dirname "${ENV_FILE}")"
if [[ "${DRY_RUN}" == 0 ]]; then
    runuser -u pyquest -- test -r "${REPO}/backend/manage.py" || die "l'utilisateur pyquest ne peut pas lire ${REPO}/backend : chmod o+rx sur les dossiers parents."
fi

step "Environnement Python du backend (${VENV}), sans compilation"
[[ -d "${VENV}" ]] || run python3 -m venv "${VENV}"
run "${VENV}/bin/pip" install --quiet --upgrade pip
run "${VENV}/bin/pip" install --quiet -r "${REPO}/backend/requirements-server.txt"

# ---- port local ------------------------------------------------------------------------------------------------------
step "Port local du backend"
if [[ -z "${PORT}" && -r "${ENV_FILE}" ]]; then
    PORT="$(envval "${ENV_FILE}" PYQUEST_PORT)"
    [[ "${PORT}" =~ ^[0-9]{2,5}$ ]] || PORT=""
    [[ -z "${PORT}" ]] || echo "port déjà enregistré dans ${ENV_FILE} : ${PORT}"
fi
if [[ -z "${PORT}" ]]; then
    PORT=8001
    while port_in_use "${PORT}"; do echo "port ${PORT} déjà utilisé sur ce serveur"; PORT=$((PORT + 1)); done
    echo "port choisi : ${PORT}"
fi

# ---- environnement ---------------------------------------------------------------------------------------------------
step "Fichier d'environnement ${ENV_FILE} (clé secrète générée, jamais écrasé)"
if [[ ! -e "${ENV_FILE}" ]]; then
    SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
    sed -e "s#__A_GENERER__#${SECRET}#" -e "s#__HOSTS__#${HOSTS}#" -e "s#__ORIGINS__#${ORIGINS}#" -e "s#^PYQUEST_PORT=.*#PYQUEST_PORT=${PORT}#" \
        "${HERE}/pyquest-intranet.env.example" | install_new "${ENV_FILE}" 640 root:pyquest
else
    echo "déjà présent, conservé : ${ENV_FILE}"
    if [[ "${DRY_RUN}" == 0 ]]; then
        # Les noms peuvent avoir changé depuis la première installation : ce sont les seules valeurs remises à jour.
        envset "${ENV_FILE}" PYQUEST_ALLOWED_HOSTS "${HOSTS}"
        envset "${ENV_FILE}" PYQUEST_ORIGIN "${ORIGINS}"
        envset "${ENV_FILE}" PYQUEST_PORT "${PORT}"
    fi
fi

# ---- certificats -----------------------------------------------------------------------------------------------------
step "Autorité de certification interne et certificat HTTPS du serveur"
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] ${REPO}/scripts/intranet_cert.sh --hosts ${HOSTS} --dir ${TLS_DIR} --if-needed"
else
    PYQUEST_TLS_DIR="${TLS_DIR}" "${REPO}/scripts/intranet_cert.sh" --hosts "${HOSTS}" --dir "${TLS_DIR}" --if-needed | grep -v '^RELOAD_NEEDED$'
    install -m 644 "${TLS_DIR}/ca.crt" "${WEB_ROOT}/ca/pyquest-ca.crt"
    install -m 644 "${HERE}/intranet-ca.html" "${WEB_ROOT}/ca/index.html"
fi

# ---- service ---------------------------------------------------------------------------------------------------------
step "Unité systemd (chemins du dépôt : ${REPO})"
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] écriture de /etc/systemd/system/pyquest.service"
else
    sed -e "s#/opt/PyQuest#${REPO}#g" "${HERE}/pyquest.service.example" > /etc/systemd/system/pyquest.service
    chmod 644 /etc/systemd/system/pyquest.service
fi
run systemctl daemon-reload

# ---- nginx -----------------------------------------------------------------------------------------------------------
step "nginx : extraits partagés et vhost HTTPS du réseau interne"
run install -d /etc/nginx/snippets
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] /etc/nginx/snippets/pyquest-locations.conf (backend sur 127.0.0.1:${PORT})"
    echo "[dry-run] vhost /etc/nginx/sites-available/pyquest pour ${NAMES}"
else
    sed -e "s#127.0.0.1:8001#127.0.0.1:${PORT}#g" "${REPO}/nginx/pyquest-locations.conf.example" > /etc/nginx/snippets/pyquest-locations.conf
    chmod 644 /etc/nginx/snippets/pyquest-locations.conf
    install -m 644 "${REPO}/nginx/pyquest-author-headers.conf.example" /etc/nginx/snippets/pyquest-author-headers.conf
    sed -e "s#__SERVER_NAMES__#${NAMES}#" -e "s#__WEB_ROOT__#${WEB_ROOT}#g" -e "s#__TLS_DIR__#${TLS_DIR}#g" \
        "${REPO}/nginx/pyquest-intranet.conf.example" > /etc/nginx/sites-available/pyquest.new
    mv /etc/nginx/sites-available/pyquest.new /etc/nginx/sites-available/pyquest
    ln -sfn /etc/nginx/sites-available/pyquest /etc/nginx/sites-enabled/pyquest
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl enable nginx >/dev/null 2>&1 || true
    systemctl reload nginx 2>/dev/null || systemctl restart nginx
fi

# ---- tâches planifiées -----------------------------------------------------------------------------------------------
step "Tâches planifiées : renouvellement du certificat (mensuel) et sauvegarde (quotidienne)"
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] /etc/cron.d/pyquest-cert et /etc/cron.d/pyquest-backup"
else
    cat > /etc/cron.d/pyquest-cert <<CRON
# Réémet le certificat du serveur s'il expire dans moins de 60 jours (l'autorité ne change pas : les postes n'ont rien à refaire).
17 4 1 * *  root  PYQUEST_TLS_DIR=${TLS_DIR} ${REPO}/scripts/intranet_cert.sh --hosts ${HOSTS} --dir ${TLS_DIR} --if-needed | grep -q RELOAD_NEEDED && systemctl reload nginx
CRON
    echo "30 3 * * *  root  ${REPO}/scripts/backup_db.sh" > /etc/cron.d/pyquest-backup
    chmod 644 /etc/cron.d/pyquest-cert /etc/cron.d/pyquest-backup
fi

step "Démarrage du service"
run systemctl enable --now pyquest
if [[ "${DRY_RUN}" == 0 ]]; then
    sleep 3
    systemctl is-active --quiet pyquest || die "le service pyquest ne démarre pas : journalctl -u pyquest -n 50"
fi

# ---- administrateur, site --------------------------------------------------------------------------------------------
if [[ "${CREATE_ADMIN}" == 1 && "${ASSUME_YES}" == 0 && "${DRY_RUN}" == 0 && -t 0 ]]; then
    if confirm "Créer maintenant le premier administrateur (accès à /api/admin/ pour gérer les auteurs) ?"; then
        "${REPO}/scripts/server_manage.sh" createsuperuser || echo "Administrateur non créé : relance ./scripts/server_manage.sh createsuperuser"
    fi
elif [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] ./scripts/server_manage.sh createsuperuser (interactif)"
fi

step "Publication du site (moteur Python téléchargé une fois)"
run "${REPO}/scripts/server_update.sh" --no-pull

FIRST="${HOST_LIST[0]}"
cat <<NEXT

==> Installation terminée. Le site est sur https://${FIRST}/
  - Postes : faire confiance à l'autorité interne UNE fois (page http://${FIRST}/ca, fichier ${TLS_DIR}/ca.crt) ; sans cela
    le navigateur affiche un avertissement et le mode hors ligne ne fonctionne pas.
  - Administration (comptes des auteurs) : https://${FIRST}/api/admin/
    Pas encore d'administrateur : ./scripts/server_manage.sh createsuperuser
  - Mises à jour : cd ${REPO} && git pull && ./scripts/server_update.sh
  - Diagnostic : ./scripts/vps_doctor.sh ; sauvegardes : /var/backups/pyquest (quotidiennes)
  - Sauvegarder ${TLS_DIR}/ca.key (clé de l'autorité) en lieu sûr, hors du serveur : la perdre obligerait à refaire la
    confiance sur tous les postes. Elle ne doit jamais être diffusée.
NEXT
