#!/usr/bin/env bash
# Mise en route de PyQuest avec Docker Compose, d'une seule commande (Docker et le plugin « compose » requis) :
#
#   ./docker/setup.sh vps      --domain pyquest.example.org --email toi@example.org
#   ./docker/setup.sh intranet --host pyquest.lycee.local,192.168.1.20
#
# Génère les secrets dans docker/.env.<mode> (jamais écrasé), construit les images (le site et le moteur Python sont
# construits dans l'image), démarre les services, puis : VPS → obtient le certificat Let's Encrypt ; intranet → l'autorité
# de certification interne est créée au premier démarrage. Relançable sans danger.
#
# Options : --domain, --email (vps) ; --host (intranet) ; --http-port N, --https-port N (essais, défaut 80 et 443) ;
#           --no-admin (ne pas proposer de créer l'administrateur) ; --yes (aucune question) ; --dry-run
# Ensuite : docker compose -f docker/compose.<mode>.yaml --env-file docker/.env.<mode> ps | logs -f | down
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${HERE}/.." && pwd)"
ASSUME_YES=0; DRY_RUN=0
# shellcheck source=deploy/lib.sh
. "${REPO}/deploy/lib.sh"

MODE="${1:-}"
case "${MODE}" in vps|intranet) shift ;; -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;; *) sed -n '2,13p' "${BASH_SOURCE[0]}" >&2; exit 2 ;; esac
DOMAIN=""; EMAIL=""; HOSTS=""; HTTP_PORT=""; HTTPS_PORT=""; CREATE_ADMIN=1; STAGING=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="${2:-}"; shift 2 ;;
        --email) EMAIL="${2:-}"; shift 2 ;;
        --host) HOSTS="${2:-}"; shift 2 ;;
        --http-port) HTTP_PORT="${2:-}"; shift 2 ;;
        --https-port) HTTPS_PORT="${2:-}"; shift 2 ;;
        --staging) STAGING=1; shift ;;
        --no-admin) CREATE_ADMIN=0; shift ;;
        --yes) ASSUME_YES=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : $1" >&2; exit 2 ;;
    esac
done

command -v docker >/dev/null || die "Docker n'est pas installé."
docker compose version >/dev/null 2>&1 || die "le plugin « docker compose » est requis (Docker 20.10 ou plus récent)."
for port in "${HTTP_PORT}" "${HTTPS_PORT}"; do
    [[ -z "${port}" || "${port}" =~ ^[0-9]{2,5}$ ]] || die "port invalide : ${port}"
done

cd "${REPO}"   # commandes affichées avec des chemins relatifs, à copier telles quelles depuis la racine du dépôt
ENV_FILE="docker/.env.${MODE}"
COMPOSE=(docker compose -f "docker/compose.${MODE}.yaml" --env-file "${ENV_FILE}")
secret() { python3 -c 'import secrets; print(secrets.token_urlsafe(64))'; }
password() { python3 -c 'import secrets, string; print("".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32)))'; }

# ---- fichier d'environnement -----------------------------------------------------------------------------------------
step "Réglages (${ENV_FILE})"
if [[ -e "${ENV_FILE}" ]]; then
    echo "déjà présent, conservé : ${ENV_FILE}"
else
    if [[ "${MODE}" == vps ]]; then
        ask DOMAIN "Nom de domaine du site (ex. pyquest.example.org)"
        ask EMAIL "Adresse e-mail pour Let's Encrypt"
        [[ "${DOMAIN}" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "domaine invalide : ${DOMAIN}"
        [[ "${EMAIL}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$ ]] || die "adresse e-mail invalide : ${EMAIL}"
    else
        ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
        ask HOSTS "Noms ou adresses IP du serveur, séparés par des virgules" "$(hostname -f 2>/dev/null || hostname)${ip:+,${ip}}"
        HOSTS="${HOSTS//, /,}"
        IFS=, read -r -a HOST_LIST <<< "${HOSTS}"
        for host in "${HOST_LIST[@]}"; do
            [[ "${host}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ || "${host}" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "nom ou adresse invalide : ${host}"
        done
    fi
    if [[ "${DRY_RUN}" == 1 ]]; then
        echo "[dry-run] création de ${ENV_FILE} (secrets générés)"
    else
        origin_suffix=""
        [[ -z "${HTTPS_PORT}" || "${HTTPS_PORT}" == 443 ]] || origin_suffix=":${HTTPS_PORT}"
        umask 077
        if [[ "${MODE}" == vps ]]; then
            sed -e "s#^PYQUEST_DOMAIN=.*#PYQUEST_DOMAIN=${DOMAIN}#" -e "s#^PYQUEST_EMAIL=.*#PYQUEST_EMAIL=${EMAIL}#" \
                -e "0,/__A_GENERER__/s##$(secret)#" -e "0,/__A_GENERER__/s##$(password)#" "docker/vps.env.example" > "${ENV_FILE}"
            [[ -z "${origin_suffix}" ]] || echo "PYQUEST_ORIGIN_PORT=${origin_suffix}" >> "${ENV_FILE}"
        else
            origins=""
            for host in "${HOST_LIST[@]}"; do origins+="https://${host}${origin_suffix},"; done
            sed -e "s#^PYQUEST_HOSTS=.*#PYQUEST_HOSTS=${HOSTS}#" -e "s#^PYQUEST_ORIGINS=.*#PYQUEST_ORIGINS=${origins%,}#" \
                -e "s#__A_GENERER__#$(secret)#" "docker/intranet.env.example" > "${ENV_FILE}"
        fi
        [[ -z "${HTTP_PORT}" ]] || envset "${ENV_FILE}" PYQUEST_HTTP_PORT "${HTTP_PORT}"
        [[ -z "${HTTPS_PORT}" ]] || envset "${ENV_FILE}" PYQUEST_HTTPS_PORT "${HTTPS_PORT}"
        echo "créé : ${ENV_FILE} (droits 600)"
    fi
fi
[[ "${DRY_RUN}" == 1 ]] && { echo "[dry-run] ${COMPOSE[*]} up -d --build"; exit 0; }
DOMAIN="$(envval "${ENV_FILE}" PYQUEST_DOMAIN)"; EMAIL="$(envval "${ENV_FILE}" PYQUEST_EMAIL)"
HOSTS="$(envval "${ENV_FILE}" PYQUEST_HOSTS)"
HTTPS_PORT="$(envval "${ENV_FILE}" PYQUEST_HTTPS_PORT)"; HTTPS_PORT="${HTTPS_PORT:-443}"
backup_dir="$(envval "${ENV_FILE}" PYQUEST_BACKUP_DIR)"; backup_dir="${backup_dir:-./backups}"
case "${backup_dir}" in /*) mkdir -p "${backup_dir}" ;; *) mkdir -p "docker/${backup_dir#./}" ;; esac

# ---- construction et démarrage -----------------------------------------------------------------------------------------
step "Construction des images (la première fois : téléchargement du moteur Python et des dépendances, quelques minutes)"
"${COMPOSE[@]}" build
step "Démarrage"
"${COMPOSE[@]}" up -d --wait --wait-timeout 180 web || { "${COMPOSE[@]}" logs --tail 40 >&2; die "les services ne démarrent pas : voir les journaux ci-dessus."; }

# ---- certificat Let's Encrypt (VPS) ---------------------------------------------------------------------------------------
if [[ "${MODE}" == vps ]]; then
    step "Certificat Let's Encrypt pour ${DOMAIN}"
    if "${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh certbot -c "test -e /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"; then
        echo "déjà obtenu"
    else
        staging=(); [[ "${STAGING}" == 0 ]] || staging=(--staging)
        "${COMPOSE[@]}" run --rm --no-deps -T --entrypoint certbot certbot certonly --webroot -w /var/www/letsencrypt \
            -d "${DOMAIN}" -m "${EMAIL}" --agree-tos --non-interactive "${staging[@]}" \
            || die "certificat non obtenu : le DNS de ${DOMAIN} pointe-t-il vers ce serveur, les ports 80 et 443 sont-ils joignables ? Relance la commande ensuite."
        "${COMPOSE[@]}" exec -T web pyquest-tls reload
    fi
fi

# ---- administrateur ------------------------------------------------------------------------------------------------------
if [[ "${CREATE_ADMIN}" == 1 && "${ASSUME_YES}" == 0 && -t 0 ]]; then
    if confirm "Créer maintenant le premier administrateur (accès à /api/admin/ pour gérer les auteurs) ?"; then
        "${COMPOSE[@]}" exec backend python manage.py createsuperuser || echo "Administrateur non créé : voir la commande ci-dessous."
    fi
fi

first="${DOMAIN:-${HOSTS%%,*}}"
port_suffix=""; [[ "${HTTPS_PORT}" == 443 ]] || port_suffix=":${HTTPS_PORT}"
HTTP_PORT="$(envval "${ENV_FILE}" PYQUEST_HTTP_PORT)"; HTTP_SUFFIX=""; [[ -z "${HTTP_PORT}" || "${HTTP_PORT}" == 80 ]] || HTTP_SUFFIX=":${HTTP_PORT}"
cat <<NEXT

==> PyQuest est en ligne : https://${first}${port_suffix}/
  - Administrateur : ${COMPOSE[*]} exec backend python manage.py createsuperuser
  - État / journaux / arrêt : ${COMPOSE[*]} ps | logs -f | down
  - Mise à jour : git pull && ${COMPOSE[*]} up -d --build
NEXT
if [[ "${MODE}" == intranet ]]; then
    cat <<NEXT
  - Postes : faire confiance à l'autorité interne UNE fois (page http://${first}${HTTP_SUFFIX}/ca) ; sans cela le navigateur
    avertit et le mode hors ligne ne fonctionne pas.
  - Sauvegarder la clé de l'autorité, hors du serveur : ${COMPOSE[*]} cp web:/etc/pyquest/tls/ca.key ./ca.key
NEXT
fi
