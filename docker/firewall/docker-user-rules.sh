#!/bin/sh
# Règles du pare-feu de l'hôte pour les conteneurs Docker (chaîne DOCKER-USER). À installer en
# /usr/local/sbin/docker-user-rules.sh (chmod 755) et à faire lancer par systemd après chaque (re)démarrage de Docker :
#
#   mkdir -p /etc/systemd/system/docker.service.d
#   printf '[Service]\nExecStartPost=-/usr/local/sbin/docker-user-rules.sh\n' > /etc/systemd/system/docker.service.d/firewall.conf
#   systemctl daemon-reload && systemctl restart docker
#
# Le « - » devant le chemin est important : un échec de ce script ne doit jamais arrêter Docker.
# Voir docs/site/fr/host/docker.md (section « Pare-feu de l'hôte »).
#
# Variables (environnement, ou à éditer ici) :
#   PUBLIC_PORTS     ports TCP publiés par des conteneurs ET ouverts à Internet (défaut : 80 443 pour PyQuest)
#   TRUSTED_IFS      interfaces de confiance dont le trafic n'est jamais filtré ici, ex. "wg0 tun0" (VPN)
#   ETH_IF           interface publique (défaut : celle de la route par défaut)
#
# Ordre des règles (de haut en bas) : on utilise -A sur une chaîne vidée. Avec -I, la dernière règle écrite serait la
# première évaluée (erreur classique : le DROP final passerait avant les ACCEPT).
PUBLIC_PORTS="${PUBLIC_PORTS:-80 443}"
TRUSTED_IFS="${TRUSTED_IFS:-}"
ETH_IF="${ETH_IF:-$(ip route show default | awk '{print $5; exit}')}"
[ -n "${ETH_IF}" ] || { echo "interface publique introuvable (ETH_IF)" >&2; exit 1; }

iptables -F DOCKER-USER || { echo "chaîne DOCKER-USER absente : Docker est-il démarré, avec le même moteur iptables (nft ou legacy) ?" >&2; exit 1; }
iptables -A DOCKER-USER -i lo -j RETURN
for iface in ${TRUSTED_IFS}; do
    iptables -A DOCKER-USER -i "${iface}" -j RETURN
done
iptables -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT   # réponses, dans les deux sens
iptables -A DOCKER-USER -i docker0 -j ACCEPT                                   # conteneurs : sortie et échanges internes
iptables -A DOCKER-USER -i 'br+' -j ACCEPT                                      # réseaux de Docker Compose
for port in ${PUBLIC_PORTS}; do
    # Port visé AVANT la traduction d'adresse de Docker : seuls les ports publiés voulus sont joignables.
    iptables -A DOCKER-USER -i "${ETH_IF}" -p tcp -m conntrack --ctorigdstport "${port}" -j ACCEPT
done
iptables -A DOCKER-USER -i "${ETH_IF}" -j DROP                                  # le reste venant d'Internet
iptables -A DOCKER-USER -j RETURN
