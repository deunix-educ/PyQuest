#!/usr/bin/env bash
# Sauvegarde de la base MariaDB de PyQuest (progressions synchronisées et comptes). À lancer SUR LE VPS, en root ou en
# utilisateur pouvant lire /etc/pyquest/env : les identifiants viennent de ce fichier, jamais de la ligne de commande
# (donc invisibles dans la liste des processus).
#
#   sudo ./scripts/backup_db.sh                      # sauvegarde dans /var/backups/pyquest, garde les 14 dernières
#   Cron quotidien (/etc/cron.d/pyquest-backup) :    30 3 * * *  root  /opt/pyquest/backend/../scripts/backup_db.sh
#   Restauration : gunzip < pyquest-AAAAMMJJ-HHMMSS.sql.gz | sudo mariadb pyquest
set -euo pipefail

ENV_FILE="${PYQUEST_ENV_FILE:-/etc/pyquest/env}"
DEST="${PYQUEST_BACKUP_DIR:-/var/backups/pyquest}"
KEEP="${PYQUEST_BACKUP_KEEP:-14}"

[[ -r "${ENV_FILE}" ]] || { echo "Impossible de lire ${ENV_FILE} (lancer avec sudo)." >&2; exit 1; }
[[ "${KEEP}" =~ ^[1-9][0-9]*$ ]] || { echo "PYQUEST_BACKUP_KEEP doit être un entier >= 1" >&2; exit 2; }
# Lecture sans « source » : le fichier est au format systemd (valeurs sans guillemets, éventuellement avec $ ou espaces).
envval() { grep -E "^$1=" "${ENV_FILE}" | tail -n1 | cut -d= -f2-; }
NAME="$(envval PYQUEST_DB_NAME)"; USER_DB="$(envval PYQUEST_DB_USER)"; PASS="$(envval PYQUEST_DB_PASSWORD)"
HOST="$(envval PYQUEST_DB_HOST)"; PORT="$(envval PYQUEST_DB_PORT)"
[[ -n "${NAME}" && -n "${USER_DB}" && -n "${PASS}" ]] || { echo "Variables PYQUEST_DB_* incomplètes dans ${ENV_FILE}." >&2; exit 1; }
DUMP="$(command -v mariadb-dump || command -v mysqldump || true)"
[[ -n "${DUMP}" ]] || { echo "mariadb-dump / mysqldump introuvable (sudo apt install mariadb-client)." >&2; exit 1; }

umask 077
mkdir -p "${DEST}"
chmod 700 "${DEST}"
CNF="$(mktemp)"
PART=""
trap 'rm -f "${CNF}" "${PART}"' EXIT
printf '[client]\nuser=%s\npassword=%s\nhost=%s\nport=%s\n' "${USER_DB}" "${PASS}" "${HOST:-127.0.0.1}" "${PORT:-3306}" > "${CNF}"

FILE="${DEST}/pyquest-$(date +%Y%m%d-%H%M%S).sql.gz"
# On écrit dans un fichier provisoire : une sauvegarde ratée n'écrase ni ne remplace jamais une bonne.
PART="${FILE}.part"
"${DUMP}" --defaults-extra-file="${CNF}" --single-transaction --routines --default-character-set=utf8mb4 "${NAME}" | gzip -9 > "${PART}"
# Une sauvegarde vide ou illisible ne doit jamais passer pour bonne.
if ! gzip -t "${PART}" || [[ "$(gunzip -c "${PART}" | wc -c)" -le 500 ]]; then
    echo "Sauvegarde invalide, supprimée." >&2
    exit 1
fi
mv "${PART}" "${FILE}"
PART=""
ls -1 "${DEST}"/pyquest-*.sql.gz | sort | head -n -"${KEEP}" | xargs -r rm -f --
echo "Sauvegarde : ${FILE} ($(du -h "${FILE}" | cut -f1)) ; conservées : $(ls -1 "${DEST}"/pyquest-*.sql.gz | wc -l)"
