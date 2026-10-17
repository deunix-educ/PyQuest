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

# ---- server_setup.sh : arguments et --dry-run -------------------------------------------------------------------
SETUP="${ROOT}/deploy/server_setup.sh"
"${SETUP}" --domain "pas un domaine" --dry-run >/dev/null 2>&1 && fail "domaine invalide accepté"
"${SETUP}" --domain pyquest.example.org --certbot pas-un-mail --dry-run >/dev/null 2>&1 && fail "e-mail invalide accepté"
"${SETUP}" --domain pyquest.example.org >/dev/null 2>&1 && fail "doit exiger root hors --dry-run" || true
out="$("${SETUP}" --domain pyquest.example.org --dry-run 2>&1)"
echo "${out}" | grep -q "\[dry-run\] .*apt-get install" || fail "le dry-run doit annoncer l'installation des paquets"
echo "${out}" | grep -q "db_setup.sh" || fail "les étapes restantes (base de données) doivent être listées"
echo "${out}" | grep -q "server_update.sh" || fail "la publication du site doit être indiquée"
echo "${out}" | grep -q "vhost complet" || fail "le dry-run doit traiter nginx"
echo "${out}" | grep -q "${ROOT}/.venv-prod" || fail "l'environnement Python doit être dans le dépôt cloné (.venv-prod)"
# Un dépôt sous /root ou /home est refusé (le service n'y aurait pas accès) : garde-fou présent dans le script.
grep -q '/root|/root/\*|/home|/home/\*' "${SETUP}" || fail "le refus des dépôts sous /root et /home est absent"

# ---- server_update.sh : versions atomiques, rotation, retour arrière, dry-run ----------------------------------------
FAKE_REPO="${WORK}/PyQuest"
mkdir -p "${FAKE_REPO}/scripts" "${FAKE_REPO}/dist/vendor/pyodide" "${FAKE_REPO}/backend"
cp "${ROOT}/scripts/server_update.sh" "${FAKE_REPO}/scripts/"
git -C "${FAKE_REPO}" init -q
git -C "${FAKE_REPO}" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
echo "v1" > "${FAKE_REPO}/dist/index.html"
touch "${FAKE_REPO}/dist/vendor/pyodide/pyodide.asm.wasm"
export PYQUEST_WEB_ROOT="${WORK}/www" PYQUEST_KEEP=2 PYQUEST_ALLOW_NON_ROOT=1
UPDATE="${FAKE_REPO}/scripts/server_update.sh"
quiet=(--no-pull --no-build --no-restart --no-check)

"${UPDATE}" "${quiet[@]}" >/dev/null
[[ "$(cat "${PYQUEST_WEB_ROOT}/current/index.html")" == v1 ]] || fail "la première version n'est pas en ligne"
sleep 1; echo "v2" > "${FAKE_REPO}/dist/index.html"; "${UPDATE}" "${quiet[@]}" >/dev/null
[[ "$(cat "${PYQUEST_WEB_ROOT}/current/index.html")" == v2 ]] || fail "la seconde version n'est pas en ligne"
sleep 1; echo "v3" > "${FAKE_REPO}/dist/index.html"; "${UPDATE}" "${quiet[@]}" >/dev/null
[[ "$(ls "${PYQUEST_WEB_ROOT}/releases" | wc -l)" == 2 ]] || fail "le nettoyage doit garder 2 versions"
[[ -L "${PYQUEST_WEB_ROOT}/current" ]] || fail "current doit être un lien"
"${UPDATE}" --rollback >/dev/null
[[ "$(cat "${PYQUEST_WEB_ROOT}/current/index.html")" == v2 ]] || fail "le retour arrière doit remettre v2"
"${UPDATE}" --rollback >/dev/null 2>&1 && fail "pas de version plus ancienne : le retour arrière doit échouer"
[[ "$(cat "${PYQUEST_WEB_ROOT}/current/index.html")" == v2 ]] || fail "un retour arrière impossible ne doit rien changer"
before="$(ls "${PYQUEST_WEB_ROOT}/releases")"
echo "v4" > "${FAKE_REPO}/dist/index.html"; "${UPDATE}" "${quiet[@]}" --dry-run >/dev/null
[[ "$(ls "${PYQUEST_WEB_ROOT}/releases")" == "${before}" ]] || fail "--dry-run ne doit rien publier"
# Un dépôt modifié localement bloque la mise à jour (git pull) au lieu de risquer une fusion.
echo "x" > "${FAKE_REPO}/tracked.txt"; git -C "${FAKE_REPO}" add tracked.txt
"${UPDATE}" --no-build --no-restart --no-check >/dev/null 2>&1 && fail "des modifications locales doivent bloquer le pull"
git -C "${FAKE_REPO}" reset -q
rm "${FAKE_REPO}/dist/index.html"; "${UPDATE}" "${quiet[@]}" >/dev/null 2>&1 && fail "dist absent accepté"
PYQUEST_WEB_ROOT='/var/www/a b' "${UPDATE}" "${quiet[@]}" >/dev/null 2>&1 && fail "chemin avec espace accepté"
PYQUEST_KEEP=0 "${UPDATE}" "${quiet[@]}" >/dev/null 2>&1 && fail "PYQUEST_KEEP=0 accepté"

# ---- server_manage.sh : lecture sûre du fichier d'environnement ----------------------------------------------------
MANAGE_REPO="${WORK}/PyQuestManage"
mkdir -p "${MANAGE_REPO}/scripts" "${MANAGE_REPO}/backend" "${MANAGE_REPO}/.venv-prod/bin"
cp "${ROOT}/scripts/server_manage.sh" "${MANAGE_REPO}/scripts/"
printf '#!/usr/bin/env bash\necho "ARGS=$*"\necho "PW=${PYQUEST_DB_PASSWORD}"\necho "KEY=${PYQUEST_SECRET_KEY}"\n' > "${MANAGE_REPO}/.venv-prod/bin/python"
chmod +x "${MANAGE_REPO}/.venv-prod/bin/python"
printf '# commentaire\nPYQUEST_DB_PASSWORD=mot de passe avec $ et "guillemets"\nPYQUEST_SECRET_KEY=abc-DEF_123\n' > "${WORK}/env2"
managed="$(PYQUEST_ENV_FILE="${WORK}/env2" "${MANAGE_REPO}/scripts/server_manage.sh" create_author ada)"
echo "${managed}" | grep -q 'ARGS=manage.py create_author ada' || fail "server_manage doit passer les arguments à manage.py"
echo "${managed}" | grep -qF 'PW=mot de passe avec $ et "guillemets"' || fail "server_manage doit transmettre le mot de passe tel quel"
PYQUEST_ENV_FILE="${WORK}/absent" "${MANAGE_REPO}/scripts/server_manage.sh" check >/dev/null 2>&1 && fail "fichier d'environnement absent accepté"

# ---- db_setup.sh : base et utilisateur MariaDB, mot de passe généré ------------------------------------------------
cat > "${WORK}/bin/mariadb" <<SH
#!/usr/bin/env bash
echo "\$*" > "${WORK}/mariadb.args"
cat > "${WORK}/mariadb.stdin"
SH
chmod +x "${WORK}/bin/mariadb"
cat > "${WORK}/env3" <<'ENV'
PYQUEST_SECRET_KEY=abc
PYQUEST_DB_NAME=pyquest
PYQUEST_DB_USER=pyquest
PYQUEST_DB_PASSWORD=__A_REMPLIR__
PYQUEST_DB_HOST=127.0.0.1
ENV
chmod 640 "${WORK}/env3"
DBSETUP="${ROOT}/deploy/db_setup.sh"
dry="$(PYQUEST_ENV_FILE="${WORK}/env3" "${DBSETUP}" --dry-run 2>&1)"
echo "${dry}" | grep -q "CREATE DATABASE" || fail "le dry-run doit montrer le SQL"
echo "${dry}" | grep -q "\*\*\*\*\*\*\*\*" || fail "le dry-run doit masquer le mot de passe"
grep -q "__A_REMPLIR__" "${WORK}/env3" || fail "le dry-run ne doit pas modifier le fichier d'environnement"
PYQUEST_ENV_FILE="${WORK}/env3" "${DBSETUP}" --admin-user admin >/dev/null
grep -q -- "-u admin -p" "${WORK}/mariadb.args" || fail "le client doit demander le mot de passe administrateur (-p)"
grep -q "PASS\|password" "${WORK}/mariadb.args" && fail "aucun mot de passe ne doit apparaître dans les arguments du client"
grep -q "CREATE DATABASE IF NOT EXISTS \`pyquest\`" "${WORK}/mariadb.stdin" || fail "le SQL de création est absent"
grep -q "ALTER USER 'pyquest'@'localhost'" "${WORK}/mariadb.stdin" || fail "le mot de passe doit être (ré)appliqué à l'utilisateur"
generated="$(grep '^PYQUEST_DB_PASSWORD=' "${WORK}/env3" | cut -d= -f2-)"
[[ "${generated}" =~ ^[A-Za-z0-9]{32}$ ]] || fail "le mot de passe généré doit être alphanumérique de 32 caractères"
grep -q "${generated}" "${WORK}/mariadb.stdin" || fail "le mot de passe écrit doit être celui appliqué à MariaDB"
[[ "$(stat -c %a "${WORK}/env3")" == 640 ]] || fail "les droits du fichier d'environnement doivent être conservés"
grep -q '^PYQUEST_SECRET_KEY=abc$' "${WORK}/env3" || fail "les autres variables doivent être conservées"
PYQUEST_ENV_FILE="${WORK}/env3" "${DBSETUP}" >/dev/null
[[ "$(grep '^PYQUEST_DB_PASSWORD=' "${WORK}/env3" | cut -d= -f2-)" == "${generated}" ]] || fail "un mot de passe existant doit être conservé à la relance"
sed -i 's/^PYQUEST_DB_HOST=.*/PYQUEST_DB_HOST=db.example.org/' "${WORK}/env3"
PYQUEST_ENV_FILE="${WORK}/env3" "${DBSETUP}" >/dev/null 2>&1 && fail "une base distante doit être refusée"
sed -i "s/^PYQUEST_DB_NAME=.*/PYQUEST_DB_NAME=x; DROP DATABASE y/; s/^PYQUEST_DB_HOST=.*/PYQUEST_DB_HOST=127.0.0.1/" "${WORK}/env3"
PYQUEST_ENV_FILE="${WORK}/env3" "${DBSETUP}" >/dev/null 2>&1 && fail "un nom de base dangereux doit être refusé"

# ---- vps_doctor.sh : s'exécute en lecture seule et signale ce qui manque -----------------------------------------
doctor="$("${ROOT}/scripts/vps_doctor.sh" 2>&1 || true)"
echo "${doctor}" | grep -q "^Système" || fail "le diagnostic doit s'exécuter"
echo "deploy/ et scripts d'exploitation : ok"
