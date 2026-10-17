#!/bin/sh
# Sauvegarde quotidienne de la base SQLite (conteneur « backup » du compose intranet, image du backend). Copie
# cohérente par l'API de sauvegarde de SQLite, sûre même si le backend écrit en même temps.
set -eu
KEEP="${PYQUEST_BACKUP_KEEP:-14}"
umask 077
while :; do
    file="/backups/pyquest-$(date +%Y%m%d-%H%M%S).sqlite.gz"
    if python - "${PYQUEST_DB_PATH}" "${file}.db" <<'PY' && gzip -9 < "${file}.db" > "${file}.part" && [ "$(gunzip -c "${file}.part" | wc -c)" -gt 500 ]
import sqlite3, sys
source = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
target = sqlite3.connect(sys.argv[2])
with target:
    source.backup(target)
target.close()
source.close()
PY
    then
        mv "${file}.part" "${file}"
        # Propriétaire du dossier monté (l'utilisateur de l'hôte), pas root du conteneur : les sauvegardes restent lisibles.
        chown "$(stat -c %u:%g /backups)" "${file}" 2>/dev/null || true
        echo "sauvegarde : ${file}"
        ls -1 /backups/pyquest-*.sqlite.gz | sort | head -n "-${KEEP}" | xargs -r rm -f --
    else
        rm -f "${file}.part"
        echo "SAUVEGARDE ÉCHOUÉE" >&2
    fi
    rm -f "${file}.db"
    sleep 86400
done
