#!/usr/bin/env bash
# Diagnostic en LECTURE SEULE d'un serveur PyQuest, à lancer SUR LE VPS (de préférence en root) depuis le dépôt cloné :
#   cd /opt/PyQuest && ./scripts/vps_doctor.sh
# Ne modifie rien et n'affiche aucun secret. Utile pour reprendre un déploiement.
set -uo pipefail

FAILED=0
REPO="${PYQUEST_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)}"
[[ -f "${REPO}/backend/manage.py" ]] || REPO=/opt/PyQuest
VENV="${REPO}/.venv-prod"
ok() { printf '  ok     %s\n' "$1"; }
ko() { printf '  ÉCHEC  %s\n' "$1"; FAILED=1; }
info() { printf '  info   %s\n' "$1"; }
can_sudo() { sudo -n true 2>/dev/null; }
as_root() { if [[ "${EUID}" -eq 0 ]]; then "$@"; elif can_sudo; then sudo -n "$@"; else return 126; fi; }

echo "Système"
info "$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-inconnu}") — $(uname -r)"
info "disque libre sur / : $(df -h / | awk 'NR==2 {print $4}')"

echo "nginx"
if command -v nginx >/dev/null; then
    version="$(nginx -v 2>&1 | sed 's/.*nginx\///')"
    ok "nginx ${version}"
    major="${version%%.*}"; minor="$(echo "${version}" | cut -d. -f2)"
    if (( major > 1 || (major == 1 && minor >= 25) )); then ok "http2 on; pris en charge"; else info "nginx < 1.25.1 : utiliser « listen 443 ssl http2; »"; fi
    if as_root nginx -t >/dev/null 2>&1; then ok "configuration valide (nginx -t)"; else info "nginx -t non vérifiable ou en échec (droits root requis) : lance « nginx -t »"; fi
    systemctl is-active --quiet nginx && ok "service nginx actif" || ko "service nginx inactif"
else
    ko "nginx n'est pas installé"
fi
[[ -f /etc/nginx/snippets/pyquest-locations.conf ]] && ok "extrait pyquest-locations.conf installé" || ko "extrait /etc/nginx/snippets/pyquest-locations.conf manquant"
[[ -f /etc/nginx/snippets/pyquest-author-headers.conf ]] && ok "extrait pyquest-author-headers.conf installé" || ko "extrait pyquest-author-headers.conf manquant"

echo "Site statique"
WEB="${PYQUEST_WEB_ROOT:-/var/www/pyquest}"
if [[ -L "${WEB}/current" ]]; then
    ok "current -> $(readlink "${WEB}/current")"
    [[ -f "${WEB}/current/index.html" ]] && ok "index.html présent" || ko "index.html absent dans current"
    [[ -f "${WEB}/current/vendor/pyodide/pyodide.asm.wasm" ]] && ok "moteur Python (Pyodide) présent" || ko "Pyodide absent : ./scripts/server_update.sh"
    info "versions conservées : $(ls -1 "${WEB}/releases" 2>/dev/null | wc -l)"
else
    ko "${WEB}/current absent : site non publié (./scripts/server_update.sh)"
fi
[[ -d "${WEB}/static/admin" ]] && ok "fichiers statiques de l'administration présents" || info "statiques de l'administration absents (créés au démarrage du service)"

echo "Backend Django"
[[ -x "${VENV}/bin/gunicorn" ]] && ok "environnement Python et gunicorn installés" || ko "${VENV}/bin/gunicorn manquant (./deploy/server_setup.sh)"
[[ -f "${REPO}/backend/manage.py" ]] && ok "dépôt cloné : ${REPO}" || ko "dépôt introuvable (git clone … /opt/PyQuest)"
if git -C "${REPO}" rev-parse --short HEAD >/dev/null 2>&1; then info "version du dépôt : $(git -C "${REPO}" rev-parse --short HEAD) ($(git -C "${REPO}" log -1 --format=%cd --date=short))"; fi
if [[ -f /etc/pyquest/env ]]; then
    perms="$(stat -c '%a %U:%G' /etc/pyquest/env)"
    ok "/etc/pyquest/env présent (${perms})"
    case "${perms%% *}" in 600|640|400|440) ok "droits du fichier d'environnement stricts" ;; *) ko "droits trop larges sur /etc/pyquest/env (attendu 640 root:pyquest)" ;; esac
    if as_root grep -q '__A_REMPLIR__\|__A_GENERER__' /etc/pyquest/env 2>/dev/null; then ko "valeurs à remplir dans /etc/pyquest/env (mot de passe de la base ?)"; fi
else
    ko "/etc/pyquest/env absent"
fi
if systemctl is-active --quiet pyquest 2>/dev/null; then
    ok "service pyquest actif"
    # Un jeton au bon format interroge la base : 404 = base joignable, 500 = base en panne.
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H 'Authorization: Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' http://127.0.0.1:8001/api/sync/)"
    case "${code}" in
        404) ok "API répond et la base de données est joignable (404 attendu)" ;;
        500) ko "l'API répond 500 : base de données injoignable ? (journalctl -u pyquest)" ;;
        *) info "API répond ${code}" ;;
    esac
    [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8001/api/auth/check/)" == 401 ]] && ok "contrôle d'accès de l'éditeur répond (401 sans session)" || ko "/api/auth/check/ ne répond pas 401"
else
    ko "service pyquest inactif (systemctl enable --now pyquest ; journalctl -u pyquest -n 50)"
fi

echo "Base de données"
if command -v mariadb >/dev/null || command -v mysql >/dev/null; then
    ok "client MariaDB/MySQL présent"
    systemctl is-active --quiet mariadb 2>/dev/null && ok "service mariadb actif" || info "service mariadb non local ou inactif"
else
    info "pas de client MariaDB/MySQL (base distante ?)"
fi

echo "Certificat"
domain="$(ls /etc/letsencrypt/live 2>/dev/null | grep -v README | head -n1 || true)"
if [[ -n "${domain}" ]]; then
    end="$(as_root openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${domain}/fullchain.pem" 2>/dev/null | cut -d= -f2)"
    if [[ -n "${end}" ]]; then
        days=$(( ( $(date -d "${end}" +%s) - $(date +%s) ) / 86400 ))
        (( days > 14 )) && ok "certificat ${domain} valide encore ${days} jours" || ko "certificat ${domain} expire dans ${days} jours"
    else
        info "certificat ${domain} non lisible sans root"
    fi
    systemctl list-timers 2>/dev/null | grep -q certbot && ok "renouvellement automatique (minuteur certbot)" || info "minuteur certbot non trouvé : vérifier le renouvellement"
else
    info "aucun certificat Let's Encrypt trouvé"
fi

echo
if [[ "${FAILED}" == 0 ]]; then echo "Aucun problème détecté."; else echo "Des points demandent une action (lignes ÉCHEC)." >&2; fi
exit "${FAILED}"
