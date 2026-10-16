#!/usr/bin/env bash
# Teste scripts/deploy.sh sans serveur : un faux « ssh » exécute les commandes en local (dans un dossier
# temporaire), ce qui permet de vérifier les versions, la bascule atomique, le nettoyage et le retour arrière.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
command -v rsync >/dev/null || { echo "rsync absent : test de déploiement ignoré"; exit 0; }

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
FAKE="${WORK}/fake-ssh"
# Même interface que ssh : [options] hôte commande... ; rsync l'appelle avec « hôte rsync --server … ».
cat > "${FAKE}" <<'SH'
#!/usr/bin/env bash
[[ "${1:-}" == "-l" ]] && shift 2 # rsync passe « -l utilisateur hôte »
shift # hôte
exec bash -c "$*"
SH
chmod +x "${FAKE}"

export DEPLOY_HOST="tester@example.invalid" DEPLOY_PATH="${WORK}/www/pyquest" DEPLOY_KEEP=2 DEPLOY_SSH="${FAKE}"
fail() { echo "ÉCHEC : $1" >&2; exit 1; }

# dist/ minimal factice (le vrai peut manquer en CI avant le build).
FAKE_ROOT="${WORK}/repo"
mkdir -p "${FAKE_ROOT}/scripts" "${FAKE_ROOT}/dist/vendor/pyodide"
cp "${ROOT}/scripts/deploy.sh" "${FAKE_ROOT}/scripts/"
echo "v1" > "${FAKE_ROOT}/dist/index.html"
touch "${FAKE_ROOT}/dist/vendor/pyodide/pyodide.asm.wasm"
DEPLOY="${FAKE_ROOT}/scripts/deploy.sh"

"${DEPLOY}" >/dev/null
[[ "$(cat "${DEPLOY_PATH}/current/index.html")" == v1 ]] || fail "la première version n'est pas en ligne"
sleep 1; echo "v2" > "${FAKE_ROOT}/dist/index.html"; "${DEPLOY}" >/dev/null
[[ "$(cat "${DEPLOY_PATH}/current/index.html")" == v2 ]] || fail "la seconde version n'est pas en ligne"
sleep 1; echo "v3" > "${FAKE_ROOT}/dist/index.html"; "${DEPLOY}" >/dev/null
[[ "$(ls "${DEPLOY_PATH}/releases" | wc -l)" == 2 ]] || fail "le nettoyage doit garder 2 versions"
[[ -L "${DEPLOY_PATH}/current" ]] || fail "current doit être un lien"

"${DEPLOY}" --rollback >/dev/null
[[ "$(cat "${DEPLOY_PATH}/current/index.html")" == v2 ]] || fail "le retour arrière doit remettre v2"
"${DEPLOY}" --rollback >/dev/null 2>&1 && fail "pas de version plus ancienne : le retour arrière doit échouer" || true
[[ "$(cat "${DEPLOY_PATH}/current/index.html")" == v2 ]] || fail "un retour arrière impossible ne doit rien changer"

# --dry-run ne modifie rien.
before="$(ls "${DEPLOY_PATH}/releases")"
echo "v4" > "${FAKE_ROOT}/dist/index.html"; "${DEPLOY}" --dry-run >/dev/null
[[ "$(ls "${DEPLOY_PATH}/releases")" == "${before}" ]] || fail "--dry-run ne doit rien envoyer"

# Valeurs dangereuses refusées avant toute connexion.
DEPLOY_HOST='x; rm -rf /' "${DEPLOY}" >/dev/null 2>&1 && fail "hôte dangereux accepté"
DEPLOY_PATH='/var/www/a b' "${DEPLOY}" >/dev/null 2>&1 && fail "chemin avec espace accepté"
DEPLOY_PATH='/' "${DEPLOY}" >/dev/null 2>&1 && fail "chemin racine accepté"
rm "${FAKE_ROOT}/dist/index.html"; "${DEPLOY}" >/dev/null 2>&1 && fail "dist absent accepté"
echo "deploy.sh : ok"
