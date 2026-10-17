# Fonctions communes aux installateurs (install_vps.sh, install_intranet.sh). À sourcer, pas à exécuter.
# Attendu du script appelant : DRY_RUN (0/1), ASSUME_YES (0/1).

step() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die() { printf 'ERREUR : %s\n' "$*" >&2; exit 1; }

# Exécute la commande, ou l'affiche seulement avec --dry-run.
run() {
    if [[ "${DRY_RUN}" == 1 ]]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}

port_in_use() { ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"; }

# Valeur d'une variable d'un fichier d'environnement (format systemd, lu sans « source »).
envval() { grep -E "^$2=" "$1" 2>/dev/null | tail -n1 | cut -d= -f2- || true; }

# Remplace (ou ajoute) une ligne NOM=valeur en conservant propriétaire et droits du fichier.
envset() { # fichier nom valeur
    local tmp
    tmp="$(mktemp)"
    grep -vE "^$2=" "$1" > "${tmp}" || true
    printf '%s=%s\n' "$2" "$3" >> "${tmp}"
    cat "${tmp}" > "$1"
    rm -f "${tmp}"
}

# Écrit un fichier depuis l'entrée standard, sauf s'il existe déjà (jamais d'écrasement de la configuration).
install_new() { # chemin mode propriétaire:groupe
    if [[ -e "$1" ]]; then echo "déjà présent, conservé : $1"; cat >/dev/null; return; fi
    if [[ "${DRY_RUN}" == 1 ]]; then echo "[dry-run] création de $1"; cat >/dev/null; return; fi
    install -m "$2" -o "${3%%:*}" -g "${3##*:}" /dev/stdin "$1"
    echo "créé : $1"
}

# ask VARIABLE "question" [défaut] : garde la valeur déjà fournie (option), sinon demande au clavier.
ask() {
    local var="$1" prompt="$2" default="${3:-}" reply
    [[ -z "${!var:-}" ]] || return 0
    if [[ ! -t 0 || "${ASSUME_YES}" == 1 ]]; then
        [[ -n "${default}" ]] || die "valeur manquante : ${prompt} (option en ligne de commande requise hors terminal)"
        printf -v "${var}" '%s' "${default}"
        return 0
    fi
    read -r -p "${prompt}${default:+ [${default}]} : " reply
    printf -v "${var}" '%s' "${reply:-${default}}"
}

# confirm "question" : oui/non (oui d'office avec --yes ou --dry-run ; non sans terminal).
confirm() {
    [[ "${ASSUME_YES}" == 1 || "${DRY_RUN}" == 1 ]] && return 0
    [[ -t 0 ]] || return 1
    local reply
    read -r -p "$1 [o/N] " reply
    [[ "${reply}" =~ ^[oOyY] ]]
}

require_root() {
    [[ "${DRY_RUN}" == 1 || "${EUID}" -eq 0 ]] || die "à lancer en root."
}

# Le service tourne sous l'utilisateur « pyquest » : le dépôt doit être lisible, donc hors de /root et /home.
check_repo_location() { # dépôt
    [[ "$1" =~ ^/[A-Za-z0-9_./-]+$ ]] || die "le chemin du dépôt ($1) ne doit contenir que des caractères simples."
    [[ -f "$1/backend/manage.py" ]] || die "$1 n'est pas un dépôt PyQuest (backend/manage.py introuvable)."
    case "$1" in /root|/root/*|/home|/home/*) die "clone le dépôt hors de /root et /home (par ex. /opt/PyQuest) : le service n'y aurait pas accès." ;; esac
}

check_os() {
    [[ -r /etc/os-release ]] || die "système non reconnu (Debian ou Ubuntu attendu)."
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-} ${ID_LIKE:-}" in
        *debian*|*ubuntu*) info "système : ${PRETTY_NAME:-${ID}}" ;;
        *) die "système ${PRETTY_NAME:-inconnu} non pris en charge : les installateurs visent Debian/Ubuntu (apt). Voir la documentation pour une installation manuelle." ;;
    esac
    command -v systemctl >/dev/null || die "systemd est requis."
}
