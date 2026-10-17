#!/usr/bin/env bash
# Installateur PyQuest pour un VPS public (domaine, certificat Let's Encrypt, MariaDB). À LANCER EN ROOT SUR LE VPS,
# DEPUIS LE DÉPÔT CLONÉ (hors de /root et /home, par ex. /opt/PyQuest) :
#
#   git clone <adresse du dépôt> /opt/PyQuest && cd /opt/PyQuest
#   ./deploy/install_vps.sh --domain pyquest.example.org --email toi@example.org [--dry-run]
#
# Enchaîne, avec contrôles préalables, les étapes que l'on ferait à la main : deploy/server_setup.sh (paquets, utilisateur,
# environnement Python, nginx, certificat), deploy/db_setup.sh (base MariaDB), démarrage du service, premier
# administrateur, publication du site (scripts/server_update.sh), sauvegarde quotidienne, contrôle final.
# Idempotent : relançable après une interruption, chaque étape reconnaît ce qui est déjà fait.
#
# --domain nom           nom public du site (son enregistrement DNS doit déjà pointer vers ce serveur)
# --email adresse        adresse pour Let's Encrypt (avis d'expiration) ; sans elle, pas de certificat automatique
# --db-admin-user nom    compte administrateur de MariaDB (défaut root ; son mot de passe est demandé par MariaDB)
# --port N               port local du backend (défaut : premier port libre à partir de 8001)
# --no-admin             ne pas proposer la création du premier administrateur
# --yes                  ne pose aucune question (--domain et --email obligatoires)
# --dry-run              affiche ce qui serait fait sans rien modifier
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${HERE}/.." && pwd)"
DOMAIN=""
EMAIL=""
DB_ADMIN=root
PORT=""
CREATE_ADMIN=1
ASSUME_YES=0
DRY_RUN=0
ENV_FILE="${PYQUEST_ENV_FILE:-/etc/pyquest/env}"
# shellcheck source=deploy/lib.sh
. "${HERE}/lib.sh"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="${2:-}"; shift 2 ;;
        --email) EMAIL="${2:-}"; shift 2 ;;
        --db-admin-user) DB_ADMIN="${2:-}"; shift 2 ;;
        --port) PORT="${2:-}"; shift 2 ;;
        --no-admin) CREATE_ADMIN=0; shift ;;
        --yes) ASSUME_YES=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) sed -n '2,21p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : $1" >&2; exit 2 ;;
    esac
done

require_root
check_repo_location "${REPO}"
[[ "${DRY_RUN}" == 1 ]] || check_os
ask DOMAIN "Nom de domaine du site (ex. pyquest.example.org)"
ask EMAIL "Adresse e-mail pour Let's Encrypt (vide : pas de certificat automatique)" "-"
[[ "${EMAIL}" != "-" ]] || EMAIL=""
[[ "${DOMAIN}" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "domaine invalide : ${DOMAIN}"
[[ -z "${EMAIL}" || "${EMAIL}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$ ]] || die "adresse e-mail invalide : ${EMAIL}"
[[ "${DB_ADMIN}" =~ ^[A-Za-z0-9_.-]+$ ]] || die "--db-admin-user invalide"

# ---- contrôles préalables ----------------------------------------------------------------------------------------------
step "Contrôles préalables"
if getent ahosts "${DOMAIN}" >/dev/null 2>&1; then
    info "le nom ${DOMAIN} se résout : $(getent ahosts "${DOMAIN}" | awk '{print $1}' | sort -u | tr '\n' ' ')"
    info "vérifie que c'est bien l'adresse de CE serveur : Let's Encrypt en dépend."
else
    echo "ATTENTION : ${DOMAIN} ne se résout pas depuis ce serveur : le certificat ne pourra pas être obtenu tant que le DNS n'est pas en place." >&2
    confirm "Continuer quand même ?" || die "installation interrompue (DNS)."
fi
for port in 80 443; do
    if port_in_use "${port}" && ! { pgrep -x nginx >/dev/null 2>&1; }; then
        echo "ATTENTION : le port ${port} est utilisé par un autre programme que nginx : ss -ltnp | grep ':${port} '" >&2
        confirm "Continuer quand même ?" || die "installation interrompue (port ${port})."
    fi
done
info "disque libre sur / : $(df -h / | awk 'NR==2 {print $4}')"
info "dépôt : ${REPO} ; version $(git -C "${REPO}" rev-parse --short HEAD 2>/dev/null || echo inconnue)"

# ---- serveur ---------------------------------------------------------------------------------------------------------
SETUP_ARGS=(--domain "${DOMAIN}")
[[ -z "${EMAIL}" ]] || SETUP_ARGS+=(--certbot "${EMAIL}")
[[ -z "${PORT}" ]] || SETUP_ARGS+=(--port "${PORT}")
[[ "${DRY_RUN}" == 0 ]] || SETUP_ARGS+=(--dry-run)
step "Serveur : paquets, utilisateur, Python, nginx, certificat"
PYQUEST_FROM_INSTALLER=1 "${HERE}/server_setup.sh" "${SETUP_ARGS[@]}"

# ---- base de données -------------------------------------------------------------------------------------------------
step "Base de données MariaDB"
if [[ "${DRY_RUN}" == 0 ]] && ! systemctl list-unit-files mariadb.service 2>/dev/null | grep -q mariadb.service; then
    echo "Le serveur MariaDB n'est pas installé sur cette machine."
    if confirm "L'installer (paquet mariadb-server) ?"; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server
        systemctl enable --now mariadb
    else
        die "MariaDB est requis : installe-le, ou crée la base sur un autre serveur (voir la documentation), puis relance."
    fi
fi
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] ${HERE}/db_setup.sh --admin-user ${DB_ADMIN} (base « pyquest », utilisateur dédié, mot de passe généré dans ${ENV_FILE})"
else
    echo "(le mot de passe de « ${DB_ADMIN} » dans MariaDB est demandé ; sur une installation neuve, la touche Entrée suffit en général)"
    "${HERE}/db_setup.sh" --admin-user "${DB_ADMIN}"
fi

# ---- service, administrateur, site -----------------------------------------------------------------------------------
step "Démarrage du service"
run systemctl enable --now pyquest
if [[ "${DRY_RUN}" == 0 ]]; then
    systemctl restart pyquest
    sleep 3
    systemctl is-active --quiet pyquest || die "le service pyquest ne démarre pas : journalctl -u pyquest -n 50"
fi

if [[ "${CREATE_ADMIN}" == 1 && "${DRY_RUN}" == 0 && "${ASSUME_YES}" == 0 && -t 0 ]]; then
    if confirm "Créer maintenant le premier administrateur (accès à /api/admin/ pour gérer les auteurs) ?"; then
        "${REPO}/scripts/server_manage.sh" createsuperuser || echo "Administrateur non créé : relance ./scripts/server_manage.sh createsuperuser"
    fi
elif [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] ./scripts/server_manage.sh createsuperuser (interactif)"
fi

step "Publication du site"
UPDATE_ARGS=(--no-pull)
[[ "${DRY_RUN}" == 0 ]] || UPDATE_ARGS+=(--dry-run)
"${REPO}/scripts/server_update.sh" "${UPDATE_ARGS[@]}"

step "Sauvegarde quotidienne de la base"
if [[ -e /etc/cron.d/pyquest-backup ]]; then
    echo "déjà présent, conservé : /etc/cron.d/pyquest-backup"
elif [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] création de /etc/cron.d/pyquest-backup"
else
    command -v cron >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq cron
    echo "30 3 * * *  root  ${REPO}/scripts/backup_db.sh" > /etc/cron.d/pyquest-backup
    chmod 644 /etc/cron.d/pyquest-backup
    echo "créé : /etc/cron.d/pyquest-backup (tous les jours à 3 h 30, 14 sauvegardes conservées)"
fi

if [[ "${DRY_RUN}" == 0 ]]; then
    step "Diagnostic final"
    "${REPO}/scripts/vps_doctor.sh" || echo "Des points demandent une action : voir les lignes ÉCHEC ci-dessus." >&2
fi

cat <<NEXT

==> Installation terminée : https://${DOMAIN}/
  - Administration (comptes des auteurs) : https://${DOMAIN}/api/admin/ ; premier administrateur si besoin :
    ./scripts/server_manage.sh createsuperuser
  - Mises à jour : cd ${REPO} && git pull && ./scripts/server_update.sh
  - Diagnostic : ./scripts/vps_doctor.sh
NEXT
[[ -n "${EMAIL}" ]] || echo "  - Pas de certificat automatique : relance avec --email adresse pour l'obtenir (HTTPS est indispensable)."
