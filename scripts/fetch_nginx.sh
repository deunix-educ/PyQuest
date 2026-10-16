#!/usr/bin/env bash
# Récupère le binaire nginx de la distribution (Debian/Ubuntu) SANS droits administrateur ni installation :
# le paquet est téléchargé puis extrait dans .local/nginx/. Utilisé par « make dev-nginx » (essai local).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${ROOT}/.local/nginx"
BINARY="${TARGET}/root/usr/sbin/nginx"

if [[ -x "${BINARY}" ]]; then
    echo "nginx déjà présent : ${BINARY}"
    exit 0
fi
command -v apt-get >/dev/null || { echo "apt-get absent : installe nginx avec le gestionnaire de ta distribution, ou indique son binaire avec PYQUEST_NGINX." >&2; exit 1; }
command -v dpkg >/dev/null || { echo "dpkg absent : voir PYQUEST_NGINX." >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
(cd "${WORK}" && apt-get download nginx)
mkdir -p "${TARGET}/root"
dpkg -x "${WORK}"/nginx_*.deb "${TARGET}/root"
"${BINARY}" -v
echo "nginx extrait dans ${TARGET} (aucune installation système)."
