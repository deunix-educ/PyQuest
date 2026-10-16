#!/usr/bin/env bash
# Teste les scripts d'exploitation du VPS sans serveur : sauvegarde de la base (faux mariadb-dump), installation
# (--dry-run : n'écrit rien) et validation des arguments. Le diagnostic (vps_doctor.sh) est seulement vérifié en lecture.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
fail() { echo "ÉCHEC : $1" >&2; exit 1; }

# ---- backup_db.sh -----------------------------------------------------------------------------------------------
mkdir -p "${WORK}/bin" "${WORK}/backups"
cat > "${WORK}/env" <<'ENV'
PYQUEST_DB_NAME=pyquest
PYQUEST_DB_USER=pyquest
PYQUEST_DB_PASSWORD=mot de passe avec $ et espaces
PYQUEST_DB_HOST=127.0.0.1
PYQUEST_DB_PORT=3306
ENV
# Faux mariadb-dump : produit un export plausible et enregistre la configuration de connexion reçue (sans l'afficher).
cat > "${WORK}/bin/mariadb-dump" <<SH
#!/usr/bin/env bash
for arg in "\$@"; do case "\$arg" in --defaults-extra-file=*) cp "\${arg#*=}" "${WORK}/cnf.copy";; esac; done
if [[ "\${FAKE_DUMP_EMPTY:-0}" == 1 ]]; then exit 0; fi
for i in \$(seq 1 40); do echo "INSERT INTO sync_syncprofile VALUES (\$i, 'hash\$i');"; done
SH
chmod +x "${WORK}/bin/mariadb-dump"
export PATH="${WORK}/bin:${PATH}" PYQUEST_ENV_FILE="${WORK}/env" PYQUEST_BACKUP_DIR="${WORK}/backups" PYQUEST_BACKUP_KEEP=2

for _ in 1 2 3; do sleep 1; "${ROOT}/scripts/backup_db.sh" >/dev/null; done
[[ "$(ls "${WORK}/backups" | wc -l)" == 2 ]] || fail "la rotation doit garder 2 sauvegardes"
latest="$(ls "${WORK}/backups"/*.sql.gz | sort | tail -n1)"
gunzip -c "${latest}" | grep -q "INSERT INTO sync_syncprofile" || fail "la sauvegarde ne contient pas l'export"
grep -q '^password=mot de passe avec \$ et espaces$' "${WORK}/cnf.copy" || fail "le mot de passe n'est pas transmis tel quel (fichier de configuration)"
[[ "$(stat -c %a "${WORK}/backups")" == 700 ]] || fail "le dossier de sauvegarde doit être privé (700)"
# Une sauvegarde vide est refusée et supprimée.
before="$(ls "${WORK}/backups" | wc -l)"
FAKE_DUMP_EMPTY=1 "${ROOT}/scripts/backup_db.sh" >/dev/null 2>&1 && fail "une sauvegarde vide ne doit pas être acceptée"
[[ "$(ls "${WORK}/backups" | wc -l)" == "${before}" ]] || fail "la sauvegarde vide n'a pas été supprimée"
# Le mot de passe n'apparaît jamais dans la sortie.
"${ROOT}/scripts/backup_db.sh" 2>&1 | grep -q "mot de passe avec" && fail "le mot de passe a fuité dans la sortie"
# Variables manquantes : refus net.
echo "PYQUEST_DB_NAME=x" > "${WORK}/env-incomplete"
PYQUEST_ENV_FILE="${WORK}/env-incomplete" "${ROOT}/scripts/backup_db.sh" >/dev/null 2>&1 && fail "variables incomplètes acceptées"

# ---- remote_setup.sh : arguments et --dry-run ------------------------------------------------------------------
SETUP="${ROOT}/deploy/remote_setup.sh"
"${SETUP}" --domain "pas un domaine" --deploy-user denis --dry-run >/dev/null 2>&1 && fail "domaine invalide accepté"
"${SETUP}" --domain pyquest.example.org --deploy-user 'x; rm -rf /' --dry-run >/dev/null 2>&1 && fail "utilisateur dangereux accepté"
"${SETUP}" --domain pyquest.example.org --deploy-user denis --certbot pas-un-mail --dry-run >/dev/null 2>&1 && fail "e-mail invalide accepté"
"${SETUP}" --domain pyquest.example.org --deploy-user denis >/dev/null 2>&1 && fail "doit exiger root hors --dry-run" || true
out="$("${SETUP}" --domain pyquest.example.org --deploy-user "$(id -un)" --dry-run 2>&1)"
echo "${out}" | grep -q "\[dry-run\] .*apt-get install" || fail "le dry-run doit annoncer l'installation des paquets"
echo "${out}" | grep -q "mariadb-setup.sql" || fail "les étapes restantes (base de données) doivent être listées"
echo "${out}" | grep -q "Pas de certificat\|vhost complet" || fail "le dry-run doit traiter nginx"

# ---- vps_doctor.sh : s'exécute en lecture seule et signale ce qui manque -----------------------------------------
doctor="$("${ROOT}/scripts/vps_doctor.sh" 2>&1 || true)"
echo "${doctor}" | grep -q "^Système" || fail "le diagnostic doit s'exécuter"
echo "deploy/ et scripts d'exploitation : ok"
