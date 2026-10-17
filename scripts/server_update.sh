#!/usr/bin/env bash
# Met à jour le site et le backend sur le VPS, EN ROOT, depuis le dépôt cloné : récupère la dernière version (git),
# construit le site, le publie par bascule atomique du lien « current » (releases/<date>-<commit>), met à jour les
# dépendances du backend, redémarre le service (migrations et statiques appliqués au démarrage), puis contrôle le site.
#
#   ./scripts/server_update.sh                # tout
#   ./scripts/server_update.sh --rollback     # revient à la version précédente du site
#   Options : --no-pull  --no-build  --no-restart  --no-check  --dry-run
#
# Variables : PYQUEST_WEB_ROOT (défaut /var/www/pyquest), PYQUEST_KEEP (versions conservées, défaut 3),
# PYQUEST_ENV_FILE (défaut /etc/pyquest/env), PYQUEST_SERVICE (défaut pyquest).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT="${PYQUEST_WEB_ROOT:-/var/www/pyquest}"
KEEP="${PYQUEST_KEEP:-3}"
ENV_FILE="${PYQUEST_ENV_FILE:-/etc/pyquest/env}"
SERVICE="${PYQUEST_SERVICE:-pyquest}"
VENV="${REPO}/.venv-prod"
PULL=1; BUILD=1; RESTART=1; CHECK=1; DRY_RUN=0; ROLLBACK=0

for arg in "$@"; do
    case "${arg}" in
        --no-pull) PULL=0 ;;
        --no-build) BUILD=0 ;;
        --no-restart) RESTART=0 ;;
        --no-check) CHECK=0 ;;
        --dry-run) DRY_RUN=1 ;;
        --rollback) ROLLBACK=1 ;;
        -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : ${arg}" >&2; exit 2 ;;
    esac
done

[[ "${WEB_ROOT}" =~ ^/[A-Za-z0-9_./-]{3,}$ ]] || { echo "PYQUEST_WEB_ROOT doit être un chemin absolu simple" >&2; exit 2; }
[[ "${KEEP}" =~ ^[1-9][0-9]*$ ]] || { echo "PYQUEST_KEEP doit être un entier >= 1" >&2; exit 2; }
# PYQUEST_ALLOW_NON_ROOT : réservé aux tests automatiques (dossiers temporaires).
[[ "${DRY_RUN}" == 1 || "${EUID}" -eq 0 || -n "${PYQUEST_ALLOW_NON_ROOT:-}" ]] || { echo "À lancer en root." >&2; exit 1; }

step() { printf '\n==> %s\n' "$*"; }
run() {
    if [[ "${DRY_RUN}" == 1 ]]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}

if [[ "${ROLLBACK}" == 1 ]]; then
    step "Retour à la version précédente du site"
    current="$(basename "$(readlink "${WEB_ROOT}/current")")"
    previous="$(ls -1 "${WEB_ROOT}/releases" | sort | grep -B1 -x "${current}" | head -n1 || true)"
    [[ -n "${previous}" && "${previous}" != "${current}" ]] || { echo "Aucune version précédente." >&2; exit 1; }
    run ln -sfn "releases/${previous}" "${WEB_ROOT}/current.tmp"
    run mv -Tf "${WEB_ROOT}/current.tmp" "${WEB_ROOT}/current"
    echo "Retour à ${previous}"
    exit 0
fi

if [[ "${PULL}" == 1 ]]; then
    step "Récupération de la dernière version (git pull --ff-only)"
    # --ff-only : jamais de fusion surprise sur le serveur ; un dépôt modifié localement est signalé.
    if ! git -C "${REPO}" diff --quiet HEAD; then
        echo "Le dépôt contient des modifications locales (fichiers édités ou supprimés sur le serveur) :" >&2
        git -C "${REPO}" status --short >&2
        echo "Pour les annuler et repartir de la version du dépôt : git -C ${REPO} restore .   (les réglages du serveur sont dans /etc/pyquest/env, pas dans le dépôt)" >&2
        exit 1
    fi
    run git -C "${REPO}" pull --ff-only
fi
COMMIT="$(git -C "${REPO}" rev-parse --short HEAD 2>/dev/null || echo nogit)"

if [[ "${BUILD}" == 1 ]]; then
    step "Moteur Python (Pyodide) et construction du site"
    run "${REPO}/scripts/vendor_pyodide.sh"
    run python3 "${REPO}/scripts/build.py"
fi
[[ "${DRY_RUN}" == 1 || -f "${REPO}/dist/index.html" ]] || { echo "dist/ est absent : relancer sans --no-build." >&2; exit 1; }
[[ "${DRY_RUN}" == 1 || -f "${REPO}/dist/vendor/pyodide/pyodide.asm.wasm" ]] || { echo "Pyodide manque dans dist/." >&2; exit 1; }

RELEASE="$(date +%Y%m%d%H%M%S)-${COMMIT}"
TARGET="${WEB_ROOT}/releases/${RELEASE}"
step "Publication : ${TARGET}"
run mkdir -p "${WEB_ROOT}/releases"
RSYNC=(rsync -a --delete --chmod=D755,F644)
[[ -d "${WEB_ROOT}/current" ]] && RSYNC+=(--link-dest="${WEB_ROOT}/current/")
run "${RSYNC[@]}" "${REPO}/dist/" "${TARGET}/"
# Bascule atomique : lien temporaire puis renommage (jamais de lien cassé).
run ln -sfn "releases/${RELEASE}" "${WEB_ROOT}/current.tmp"
run mv -Tf "${WEB_ROOT}/current.tmp" "${WEB_ROOT}/current"
# Ne garde que les KEEP dernières versions.
if [[ "${DRY_RUN}" == 0 ]]; then
    (cd "${WEB_ROOT}/releases" && ls -1 | sort | head -n -"${KEEP}" | xargs -r rm -rf --)
fi

if [[ -x "${VENV}/bin/pip" ]]; then
    step "Dépendances du backend"
    run "${VENV}/bin/pip" install --quiet -r "${REPO}/backend/requirements-prod.txt"
else
    echo "(pas d'environnement ${VENV} : backend non installé, ./deploy/server_setup.sh d'abord)"
    RESTART=0
fi

if [[ "${RESTART}" == 1 ]]; then
    step "Redémarrage du service ${SERVICE} (migrations et statiques appliqués au démarrage)"
    run systemctl restart "${SERVICE}"
    if [[ "${DRY_RUN}" == 0 ]]; then
        sleep 3
        systemctl is-active --quiet "${SERVICE}" || { echo "Le service ${SERVICE} ne démarre pas : journalctl -u ${SERVICE} -n 50" >&2; exit 1; }
    fi
fi

if [[ "${CHECK}" == 1 && "${DRY_RUN}" == 0 && -r "${ENV_FILE}" ]]; then
    ORIGIN="$(grep -E '^PYQUEST_ORIGIN=' "${ENV_FILE}" | tail -n1 | cut -d= -f2- || true)"
    if [[ -n "${ORIGIN}" ]]; then
        step "Contrôle du site publié (${ORIGIN})"
        "${REPO}/scripts/check_deploy.sh" "${ORIGIN}" || echo "Des contrôles ont échoué : voir ci-dessus (retour arrière : $0 --rollback)." >&2
    fi
fi

echo
echo "En ligne : ${RELEASE} (retour arrière du site : $0 --rollback)"
