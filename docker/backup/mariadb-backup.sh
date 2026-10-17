#!/bin/sh
# Sauvegarde quotidienne de la base MariaDB (conteneur « backup » du compose VPS). Le mot de passe vient de MYSQL_PWD.
# Une sauvegarde est écrite dans un fichier provisoire puis déplacée : une sauvegarde ratée ne remplace jamais une bonne.
set -eu
KEEP="${PYQUEST_BACKUP_KEEP:-14}"
umask 077
while :; do
    file="/backups/pyquest-$(date +%Y%m%d-%H%M%S).sql.gz"
    if mariadb-dump -h db -u "${MARIADB_USER}" --single-transaction --routines --default-character-set=utf8mb4 "${MARIADB_DATABASE}" | gzip -9 > "${file}.part" \
        && [ "$(gunzip -c "${file}.part" | wc -c)" -gt 500 ]; then
        mv "${file}.part" "${file}"
        # Propriétaire du dossier monté (l'utilisateur de l'hôte), pas root du conteneur : les sauvegardes restent lisibles.
        chown "$(stat -c %u:%g /backups)" "${file}" 2>/dev/null || true
        echo "sauvegarde : ${file}"
        ls -1 /backups/pyquest-*.sql.gz | sort | head -n "-${KEEP}" | xargs -r rm -f --
    else
        rm -f "${file}.part"
        echo "SAUVEGARDE ÉCHOUÉE" >&2
    fi
    sleep 86400
done
