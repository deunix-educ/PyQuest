#!/usr/bin/env bash
# Première installation sur un VPS, depuis ta machine : envoie le code du backend, les fichiers de déploiement et
# nginx/, puis exécute deploy/remote_setup.sh en root sur le VPS (sudo, mot de passe demandé si besoin).
#
#   DEPLOY_HOST=utilisateur@vps.example.org ./scripts/vps_bootstrap.sh --domain pyquest.example.org [--certbot mail] [--dry-run]
#
# Recommandé : commencer par --dry-run (n'écrit rien sur le VPS, affiche ce qui serait fait).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${DEPLOY_HOST:-}"
SSH="${DEPLOY_SSH:-ssh}"
DOMAIN=""
EXTRA=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="${2:-}"; shift 2 ;;
        --certbot) EXTRA+=(--certbot "${2:-}"); shift 2 ;;
        --dry-run) EXTRA+=(--dry-run); shift ;;
        -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : $1" >&2; exit 2 ;;
    esac
done
[[ "${HOST}" =~ ^[A-Za-z0-9_.@:-]+$ ]] || { echo "DEPLOY_HOST manquant ou invalide (ex. utilisateur@vps.example.org)" >&2; exit 2; }
[[ "${DOMAIN}" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "--domain manquant ou invalide" >&2; exit 2; }
DEPLOY_USER="${HOST%%@*}"
[[ "${HOST}" == *@* ]] || { echo "DEPLOY_HOST doit contenir l'utilisateur (utilisateur@hote)" >&2; exit 2; }

echo "1/3 Envoi du code du backend"
"${ROOT}/scripts/deploy.sh" --backend --no-restart

echo "2/3 Envoi des fichiers d'installation"
STAGE="/tmp/pyquest-setup"
# shellcheck disable=SC2086
${SSH} "${HOST}" "rm -rf '${STAGE}' && mkdir -p '${STAGE}'"
rsync -az -e "${SSH}" "${ROOT}/deploy/" "${HOST}:${STAGE}/deploy/"
rsync -az -e "${SSH}" "${ROOT}/nginx/" "${HOST}:${STAGE}/nginx/"
# shellcheck disable=SC2086
${SSH} "${HOST}" "mkdir -p '${STAGE}/scripts'"
rsync -az -e "${SSH}" "${ROOT}/scripts/backup_db.sh" "${HOST}:${STAGE}/scripts/"

echo "3/3 Installation sur le VPS (sudo)"
# shellcheck disable=SC2086
${SSH} -t "${HOST}" "sudo bash '${STAGE}/deploy/remote_setup.sh' --domain '${DOMAIN}' --deploy-user '${DEPLOY_USER}' ${EXTRA[*]:-}"
