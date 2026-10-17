#!/usr/bin/env bash
# Autorité de certification interne et certificat HTTPS du serveur PyQuest en intranet (sans Let's Encrypt : un réseau
# de lycée n'a pas de nom public). À lancer EN ROOT sur le serveur ; appelé par deploy/install_intranet.sh.
#
#   ./scripts/intranet_cert.sh --hosts pyquest.lycee.local,192.168.1.20 [--dir /etc/pyquest/tls] [--if-needed]
#
# - crée une fois l'autorité (ca.key privée root:root 600, ca.crt valable 10 ans) ;
# - émet le certificat du serveur (server.crt / server.key, 825 jours) pour chaque nom ou adresse IP donné ;
# - --if-needed : ne réémet que si le certificat manque, expire dans moins de 60 jours ou si la liste des noms a changé
#   (utilisé par la tâche cron mensuelle) ; le certificat de l'autorité, lui, ne change pas : les postes déjà configurés
#   continuent de faire confiance.
# Copier ca.crt sur les postes une seule fois (voir la page /ca du serveur et la documentation).
set -euo pipefail

DIR="${PYQUEST_TLS_DIR:-/etc/pyquest/tls}"
HOSTS=""
IF_NEEDED=0
RENEW_DAYS=60

while [[ $# -gt 0 ]]; do
    case "$1" in
        --hosts) HOSTS="${2:-}"; shift 2 ;;
        --dir) DIR="${2:-}"; shift 2 ;;
        --if-needed) IF_NEEDED=1; shift ;;
        -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "Option inconnue : $1" >&2; exit 2 ;;
    esac
done

[[ -n "${HOSTS}" ]] || { echo "--hosts est requis (noms et/ou adresses IPv4, séparés par des virgules)" >&2; exit 2; }
[[ "${DIR}" =~ ^/[A-Za-z0-9_./-]+$ ]] || { echo "--dir invalide" >&2; exit 2; }
command -v openssl >/dev/null || { echo "openssl introuvable" >&2; exit 1; }

IFS=, read -r -a LIST <<< "${HOSTS}"
SAN=""
for host in "${LIST[@]}"; do
    if [[ "${host}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
        SAN+="IP:${host},"
    elif [[ "${host}" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]]; then
        SAN+="DNS:${host},"
    else
        echo "nom ou adresse invalide : ${host}" >&2; exit 2
    fi
done
SAN="${SAN%,}"
COMMON_NAME="${LIST[0]}"

umask 077
mkdir -p "${DIR}"
chmod 755 "${DIR}"

if [[ ! -s "${DIR}/ca.key" || ! -s "${DIR}/ca.crt" ]]; then
    echo "Création de l'autorité de certification interne (${DIR}/ca.crt)"
    openssl req -x509 -new -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
        -keyout "${DIR}/ca.key" -out "${DIR}/ca.crt" -days 3650 \
        -subj "/O=PyQuest/CN=PyQuest autorité locale (${COMMON_NAME})" \
        -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
        -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
    chmod 600 "${DIR}/ca.key"
    chmod 644 "${DIR}/ca.crt"
fi

needs_issue() {
    [[ -s "${DIR}/server.crt" && -s "${DIR}/server.key" && -f "${DIR}/hosts.txt" ]] || return 0
    [[ "$(cat "${DIR}/hosts.txt")" == "${HOSTS}" ]] || return 0
    openssl x509 -checkend $((RENEW_DAYS * 86400)) -noout -in "${DIR}/server.crt" >/dev/null || return 0
    openssl verify -CAfile "${DIR}/ca.crt" "${DIR}/server.crt" >/dev/null 2>&1 || return 0
    return 1
}

if [[ "${IF_NEEDED}" == 1 ]] && ! needs_issue; then
    echo "Certificat du serveur à jour : $(openssl x509 -enddate -noout -in "${DIR}/server.crt")"
    exit 0
fi

echo "Émission du certificat du serveur pour : ${HOSTS}"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
openssl req -new -nodes -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
    -keyout "${WORK}/server.key" -out "${WORK}/server.csr" -subj "/O=PyQuest/CN=${COMMON_NAME}" 2>/dev/null
printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\n' "${SAN}" > "${WORK}/ext.cnf"
openssl x509 -req -in "${WORK}/server.csr" -CA "${DIR}/ca.crt" -CAkey "${DIR}/ca.key" -CAcreateserial \
    -CAserial "${DIR}/ca.srl" -days 825 -extfile "${WORK}/ext.cnf" -out "${WORK}/server.crt" 2>/dev/null
openssl verify -CAfile "${DIR}/ca.crt" "${WORK}/server.crt" >/dev/null
# Mise en place atomique : nginx ne voit jamais un couple clé/certificat à moitié écrit.
chmod 600 "${WORK}/server.key"; chmod 644 "${WORK}/server.crt"
mv "${WORK}/server.key" "${DIR}/server.key"
mv "${WORK}/server.crt" "${DIR}/server.crt"
printf '%s' "${HOSTS}" > "${DIR}/hosts.txt"
echo "Certificat émis : $(openssl x509 -enddate -noout -in "${DIR}/server.crt")"
echo "RELOAD_NEEDED"
