#!/usr/bin/env bash
# Télécharge Pyodide (version épinglée) et l'installe dans vendor/pyodide/.
# Pyodide doit être servi depuis le même domaine (COEP require-corp interdit le CDN cross-origin).
set -euo pipefail

PYODIDE_VERSION="314.0.7"
PYODIDE_SHA256="2abdcc2e35208af406e07724cffa85bc582ced97e9028383ecf5462541393f95"
URL="https://github.com/pyodide/pyodide/releases/download/${PYODIDE_VERSION}/pyodide-core-${PYODIDE_VERSION}.tar.bz2"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${ROOT}/vendor/pyodide"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

if [[ -f "${TARGET}/.version" && "$(cat "${TARGET}/.version")" == "${PYODIDE_VERSION}" ]]; then
    echo "Pyodide ${PYODIDE_VERSION} déjà installé dans ${TARGET}"
    exit 0
fi

echo "Téléchargement de Pyodide ${PYODIDE_VERSION}..."
curl --fail --location --silent --show-error --output "${WORK}/pyodide.tar.bz2" "${URL}"

echo "${PYODIDE_SHA256}  ${WORK}/pyodide.tar.bz2" | sha256sum --check --status \
    || { echo "Somme de contrôle invalide pour ${URL}" >&2; exit 1; }

mkdir -p "${WORK}/extract"
tar --extract --bzip2 --file "${WORK}/pyodide.tar.bz2" --directory "${WORK}/extract"

rm -rf "${TARGET}"
mkdir -p "${ROOT}/vendor"
mv "${WORK}/extract/pyodide" "${TARGET}"
echo "${PYODIDE_VERSION}" > "${TARGET}/.version"
echo "Pyodide ${PYODIDE_VERSION} installé dans ${TARGET}"
