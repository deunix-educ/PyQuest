#!/usr/bin/env bash
# Déploie dist/ sur un VPS : envoi dans un dossier de version (releases/<date>-<commit>), puis bascule
# atomique du lien « current » vers cette version. Le site reste servi sans coupure ; on peut revenir en
# arrière (--rollback). Aucun secret ici : l'hôte vient de l'environnement, l'authentification de ta clé SSH.
#
#   DEPLOY_HOST=utilisateur@vps.example.org ./scripts/deploy.sh [--dry-run]
#   DEPLOY_HOST=utilisateur@vps.example.org ./scripts/deploy.sh --rollback
#
# Variables : DEPLOY_HOST (obligatoire), DEPLOY_PATH (défaut /var/www/pyquest), DEPLOY_KEEP (défaut 3),
# DEPLOY_SSH (défaut « ssh -o BatchMode=yes »).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${DEPLOY_HOST:-}"
REMOTE_PATH="${DEPLOY_PATH:-/var/www/pyquest}"
KEEP="${DEPLOY_KEEP:-3}"
SSH="${DEPLOY_SSH:-ssh -o BatchMode=yes}"
MODE="deploy"
DRY_RUN=0

for arg in "$@"; do
    case "${arg}" in
        --dry-run) DRY_RUN=1 ;;
        --rollback) MODE="rollback" ;;
        -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : ${arg}" >&2; exit 2 ;;
    esac
done

# Ces valeurs sont insérées dans des commandes distantes : on n'accepte que des caractères sûrs.
[[ "${HOST}" =~ ^[A-Za-z0-9_.@:-]+$ ]] || { echo "DEPLOY_HOST manquant ou invalide (ex. utilisateur@vps.example.org)" >&2; exit 2; }
[[ "${REMOTE_PATH}" =~ ^/[A-Za-z0-9_./-]{3,}$ ]] || { echo "DEPLOY_PATH doit être un chemin absolu simple (ex. /var/www/pyquest)" >&2; exit 2; }
[[ "${KEEP}" =~ ^[1-9][0-9]*$ ]] || { echo "DEPLOY_KEEP doit être un entier >= 1" >&2; exit 2; }

remote() {
    if [[ "${DRY_RUN}" == 1 ]]; then
        echo "[dry-run] ssh ${HOST} $*"
    else
        # shellcheck disable=SC2086 # ${SSH} contient volontairement plusieurs mots
        ${SSH} "${HOST}" "$@"
    fi
}

if [[ "${MODE}" == "rollback" ]]; then
    # Bascule vers la version précédente (la plus récente avant celle qui est en ligne).
    remote "set -e; cd '${REMOTE_PATH}'; current=\$(basename \"\$(readlink current)\"); \
previous=\$(ls -1 releases | sort | grep -B1 -x \"\$current\" | head -n1); \
[ -n \"\$previous\" ] && [ \"\$previous\" != \"\$current\" ] || { echo 'Aucune version précédente.' >&2; exit 1; }; \
ln -sfn \"releases/\$previous\" current.tmp && mv -Tf current.tmp current; echo \"Retour à \$previous\""
    exit 0
fi

[[ -f "${ROOT}/dist/index.html" ]] || { echo "dist/ est absent : lance d'abord « make build »." >&2; exit 1; }
[[ -f "${ROOT}/dist/vendor/pyodide/pyodide.asm.wasm" ]] || { echo "Pyodide manque dans dist/ : « make vendor-pyodide » puis « make build »." >&2; exit 1; }

COMMIT="$(git -C "${ROOT}" rev-parse --short HEAD 2>/dev/null || echo nogit)"
git -C "${ROOT}" diff --quiet HEAD 2>/dev/null || COMMIT="${COMMIT}-dirty"
RELEASE="$(date +%Y%m%d%H%M%S)-${COMMIT}"
TARGET="${REMOTE_PATH}/releases/${RELEASE}"

echo "Déploiement de dist/ ($(du -sh "${ROOT}/dist" | cut -f1)) vers ${HOST}:${TARGET}"
remote "mkdir -p '${REMOTE_PATH}/releases'"

RSYNC=(rsync -az --delete --chmod=D755,F644 -e "${SSH}")
# Réutilise (liens physiques) les fichiers inchangés de la version en ligne : envoi plus rapide, moins de disque.
# shellcheck disable=SC2086
if ${SSH} "${HOST}" "test -d '${REMOTE_PATH}/current'" 2>/dev/null; then
    RSYNC+=(--link-dest="${REMOTE_PATH}/current/")
fi
[[ "${DRY_RUN}" == 1 ]] && RSYNC+=(--dry-run --itemize-changes)
"${RSYNC[@]}" "${ROOT}/dist/" "${HOST}:${TARGET}/"

# Bascule atomique : création d'un lien temporaire puis renommage (jamais de lien cassé).
remote "set -e; cd '${REMOTE_PATH}'; ln -sfn 'releases/${RELEASE}' current.tmp && mv -Tf current.tmp current"
# Ne garde que les KEEP dernières versions (la version en ligne est toujours la plus récente).
remote "cd '${REMOTE_PATH}/releases' && ls -1 | sort | head -n -${KEEP} | xargs -r rm -rf --"

echo "En ligne : ${RELEASE} (retour arrière : DEPLOY_HOST=${HOST} $0 --rollback)"
