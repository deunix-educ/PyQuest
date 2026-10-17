#!/usr/bin/env bash
# Lance une commande « manage.py » de Django avec la configuration de production (/etc/pyquest/env) et l'environnement
# Python du serveur. À utiliser SUR LE VPS, en root, depuis le dépôt cloné :
#
#   ./scripts/server_manage.sh createsuperuser          # premier administrateur
#   ./scripts/server_manage.sh create_author ada        # compte auteur (--reset, --admin)
#   ./scripts/server_manage.sh migrate | check | shell
#
# Le fichier d'environnement est lu ligne à ligne (pas de « source ») : un mot de passe contenant $ ou des espaces ne
# pose pas de problème.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PYQUEST_ENV_FILE:-/etc/pyquest/env}"
VENV="${REPO}/.venv-prod"

[[ -r "${ENV_FILE}" ]] || { echo "Impossible de lire ${ENV_FILE} (root requis, installation faite ?)." >&2; exit 1; }
[[ -x "${VENV}/bin/python" ]] || { echo "${VENV} absent : lancer ./deploy/server_setup.sh d'abord." >&2; exit 1; }
[[ $# -ge 1 ]] || { sed -n '2,10p' "${BASH_SOURCE[0]}"; exit 2; }

while IFS= read -r line; do
    [[ "${line}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && export "${line?}"
done < "${ENV_FILE}"

cd "${REPO}/backend"
exec "${VENV}/bin/python" manage.py "$@"
