#!/usr/bin/env bash
# Vérifie un site PyQuest déployé : en-têtes d'isolation (COOP/COEP/CORP), types MIME, moteur Python,
# service worker, redirection HTTPS. Quitte avec un code non nul au premier défaut.
#
#   ./scripts/check_deploy.sh https://pyquest.example.org
set -uo pipefail

BASE="${1:-}"
[[ "${BASE}" =~ ^https?://[A-Za-z0-9._:-]+/?$ ]] || { echo "Usage : $0 https://domaine" >&2; exit 2; }
BASE="${BASE%/}"
FAILED=0

# header <url> <nom> : valeur de l'en-tête (minuscules), vide s'il est absent.
header() {
    curl -sI --max-time 20 "$1" | tr -d '\r' | awk -v name="$(echo "$2" | tr 'A-Z' 'a-z'):" 'tolower($1) == name { sub(/^[^:]*: */, ""); print tolower($0) }'
}
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }
ok() { printf '  ok    %s\n' "$1"; }
ko() { printf '  ÉCHEC %s\n' "$1"; FAILED=1; }
expect_header() { # url nom attendu
    local got
    got="$(header "$1" "$2")"
    if [[ "${got}" == *"$3"* ]]; then ok "$2 = $3 ($1)"; else ko "$2 attendu « $3 », reçu « ${got} » ($1)"; fi
}
expect_status() {
    local got
    got="$(status "$1")"
    if [[ "${got}" == "$2" ]]; then ok "$2 $1"; else ko "$1 : code $2 attendu, reçu ${got}"; fi
}

echo "Contrôle de ${BASE}"
for path in / /service-worker.js /vendor/pyodide/pyodide.asm.wasm /js/workers/python-worker.js; do
    expect_status "${BASE}${path}" 200
    expect_header "${BASE}${path}" Cross-Origin-Opener-Policy same-origin
    expect_header "${BASE}${path}" Cross-Origin-Embedder-Policy require-corp
    expect_header "${BASE}${path}" Cross-Origin-Resource-Policy same-origin
done
expect_header "${BASE}/vendor/pyodide/pyodide.asm.wasm" Content-Type application/wasm
expect_header "${BASE}/js/workers/python-worker.js" Content-Type javascript
expect_header "${BASE}/service-worker.js" Cache-Control no-cache
expect_header "${BASE}/css/base.css" Content-Type text/css
expect_header "${BASE}/manifest.webmanifest" Content-Type manifest+json
expect_status "${BASE}/levels/manifest.json" 200

# Éditeur de niveaux : derrière le backend il est protégé (302 vers la connexion) ; sans backend il est public (200).
author_code="$(status "${BASE}/author.html")"
author_location="$(header "${BASE}/author.html" Location)"
if [[ "${author_code}" == 302 && "${author_location}" == *"/api/auth/login/"* ]]; then
    ok "author.html protégé par connexion (302 vers /api/auth/login/)"
    expect_status "${BASE}/api/auth/login/" 200
    expect_header "${BASE}/api/auth/login/" Content-Type text/html
    # Le contrôle interne réservé à nginx ne doit pas être joignable de l'extérieur.
    expect_status "${BASE}/api/auth/check/" 404
    # Administration : redirige vers sa connexion ; ses fichiers statiques sont servis par nginx.
    admin_code="$(status "${BASE}/api/admin/")"
    if [[ "${admin_code}" == 302 ]]; then ok "administration protégée (302 vers sa connexion)"; else ko "/api/admin/ : 302 attendu, reçu ${admin_code}"; fi
    expect_status "${BASE}/api/static/admin/css/base.css" 200
    expect_header "${BASE}/api/static/admin/css/base.css" Content-Type text/css
elif [[ "${author_code}" == 200 ]]; then
    info "author.html est PUBLIC (200) : normal sans backend Django, sinon l'accès authentifié n'est pas actif"
else
    ko "author.html : 200 (public) ou 302 vers la connexion attendus, reçu ${author_code}"
fi

if [[ "${BASE}" == https://* ]]; then
    redirect="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://${BASE#https://}/")"
    if [[ "${redirect}" == 301 || "${redirect}" == 308 ]]; then ok "HTTP redirige vers HTTPS (${redirect})"; else ko "HTTP devrait rediriger vers HTTPS, code ${redirect}"; fi
fi

# Information seulement : la synchronisation est facultative.
api="$(status "${BASE}/api/sync/")"
echo "  info  /api/sync/ répond ${api} (401 = backend actif, 404 = pas de synchronisation)"

if [[ "${FAILED}" == 0 ]]; then echo "Tout est correct."; else echo "Des contrôles ont échoué." >&2; fi
exit "${FAILED}"
