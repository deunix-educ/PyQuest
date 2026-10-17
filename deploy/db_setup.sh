#!/usr/bin/env bash
# Crée la base et l'utilisateur MariaDB de PyQuest et écrit le mot de passe généré dans /etc/pyquest/env.
# À LANCER SUR LE VPS, EN ROOT, après deploy/server_setup.sh. Le compte administrateur de MariaDB est demandé au clavier
# (rien n'est mis dans la liste des processus ni dans un fichier du dépôt).
#
#   ./deploy/db_setup.sh                       # administrateur MariaDB « root » (mot de passe demandé)
#   ./deploy/db_setup.sh --admin-user admin    # autre compte administrateur
#   ./deploy/db_setup.sh --dry-run             # affiche ce qui serait fait
#
# Idempotent : la base et l'utilisateur sont créés s'ils n'existent pas ; un mot de passe déjà défini dans
# /etc/pyquest/env est conservé (et réappliqué à l'utilisateur).
set -euo pipefail

ENV_FILE="${PYQUEST_ENV_FILE:-/etc/pyquest/env}"
ADMIN_USER="root"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --admin-user) ADMIN_USER="${2:-}"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : $1" >&2; exit 2 ;;
    esac
done

[[ "${ADMIN_USER}" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "--admin-user invalide" >&2; exit 2; }
[[ -r "${ENV_FILE}" ]] || { echo "Impossible de lire ${ENV_FILE} : lancer d'abord ./deploy/server_setup.sh (en root)." >&2; exit 1; }
CLIENT="$(command -v mariadb || command -v mysql || true)"
[[ -n "${CLIENT}" ]] || { echo "Client mariadb/mysql introuvable (apt install mariadb-client)." >&2; exit 1; }

envval() { grep -E "^$1=" "${ENV_FILE}" | tail -n1 | cut -d= -f2- || true; }
DB_NAME="$(envval PYQUEST_DB_NAME)"; DB_USER="$(envval PYQUEST_DB_USER)"; DB_PASS="$(envval PYQUEST_DB_PASSWORD)"
DB_HOST="$(envval PYQUEST_DB_HOST)"; DB_HOST="${DB_HOST:-127.0.0.1}"
[[ "${DB_NAME}" =~ ^[A-Za-z0-9_]{1,64}$ && "${DB_USER}" =~ ^[A-Za-z0-9_]{1,32}$ ]] || { echo "PYQUEST_DB_NAME / PYQUEST_DB_USER invalides dans ${ENV_FILE} (lettres, chiffres, _)." >&2; exit 1; }
case "${DB_HOST}" in
    127.0.0.1|localhost) ;;
    *) echo "PYQUEST_DB_HOST=${DB_HOST} : ce script ne gère que MariaDB sur ce serveur (127.0.0.1). Crée la base à la main (deploy/mariadb-setup.sql.example)." >&2; exit 1 ;;
esac

# Mot de passe : celui déjà en place, sinon un mot de passe aléatoire (alphanumérique : aucun risque dans le SQL).
GENERATED=0
if [[ -z "${DB_PASS}" || "${DB_PASS}" == __A_REMPLIR__ ]]; then
    DB_PASS="$(python3 -c 'import secrets, string; print("".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32)))')"
    GENERATED=1
fi
[[ "${DB_PASS}" =~ ^[A-Za-z0-9._~-]{12,}$ ]] || { echo "Le mot de passe de ${ENV_FILE} contient des caractères que ce script refuse d'insérer dans du SQL : supprime la ligne PYQUEST_DB_PASSWORD pour en faire générer un." >&2; exit 1; }

SQL="CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;"

echo "Base « ${DB_NAME} » et utilisateur « ${DB_USER}'@'localhost » (administrateur MariaDB : ${ADMIN_USER})"
if [[ "${DRY_RUN}" == 1 ]]; then
    echo "[dry-run] SQL (mot de passe masqué) :"
    echo "${SQL//${DB_PASS}/********}"
    [[ "${GENERATED}" == 1 ]] && echo "[dry-run] un mot de passe aléatoire serait écrit dans ${ENV_FILE}"
    exit 0
fi

# Le SQL passe par l'entrée standard ; le mot de passe de l'administrateur est demandé par le client sur le terminal.
printf '%s\n' "${SQL}" | "${CLIENT}" -u "${ADMIN_USER}" -p

if [[ "${GENERATED}" == 1 ]]; then
    # Remplace la ligne (ou l'ajoute) sans toucher aux droits du fichier.
    TMP="$(mktemp)"
    trap 'rm -f "${TMP}"' EXIT
    grep -vE '^PYQUEST_DB_PASSWORD=' "${ENV_FILE}" > "${TMP}" || true
    printf 'PYQUEST_DB_PASSWORD=%s\n' "${DB_PASS}" >> "${TMP}"
    cat "${TMP}" > "${ENV_FILE}"
    echo "Mot de passe généré et enregistré dans ${ENV_FILE} (non affiché)."
fi
echo "Terminé. Suite : systemctl enable --now pyquest"
