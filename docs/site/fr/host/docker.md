# Docker Compose : VPS et intranet

Alternative aux [installateurs](installers.md) : toute la pile tourne dans des conteneurs, sans rien installer sur
l'hôte à part Docker (avec le plugin `docker compose`). Deux fichiers prêts à l'emploi, un par situation :

| | VPS public | Réseau intranet (lycée) |
|---|---|---|
| Fichier | `docker/compose.vps.yaml` | `docker/compose.intranet.yaml` |
| Commande | `./docker/setup.sh vps` | `./docker/setup.sh intranet` |
| HTTPS | **Let's Encrypt** (service `certbot`, renouvellement automatique) | **autorité de certification interne** créée au premier démarrage |
| Base | **MariaDB** (service `db`) | **SQLite** (volume `data`) |
| Services | `web` (nginx), `backend` (Django), `db`, `certbot`, `backup` | `web`, `backend`, `backup` |

Les images contiennent le site et le moteur Python (Pyodide, téléchargé et vérifié à la construction) : **aucun
`make build` à faire**, et le serveur n'a pas besoin d'Internet une fois les images construites.

## VPS

Prérequis : Docker, le nom de domaine qui pointe vers le VPS, les ports 80 et 443 libres.

```bash
git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest && cd /opt/PyQuest
./docker/setup.sh vps --domain pyquest.example.org --email toi@example.org
```

Le script génère les secrets dans `docker/.env.vps` (droits 600, jamais commité, jamais écrasé), construit les images,
démarre la pile avec un certificat provisoire (nginx doit répondre pour que Let's Encrypt valide le domaine), obtient le
vrai certificat, le met en service, puis propose de créer le premier administrateur. Ajoute `--staging` pour essayer avec
le serveur de test de Let's Encrypt (pas de limite de débit).

## Intranet

```bash
./docker/setup.sh intranet --host pyquest.lycee.local,192.168.1.20
```

Même principe : secrets dans `docker/.env.intranet`, autorité et certificat internes créés au premier démarrage dans le
volume `tls` (le certificat est réémis automatiquement avant son expiration, l'autorité ne change pas). Les **postes
doivent faire confiance à l'autorité une fois** : page `http://<serveur>/ca` (voir [Les installateurs](installers.md),
section intranet, y compris le profil de navigateur par élève). **Sauvegarde la clé de l'autorité hors du serveur** :
`docker compose -f docker/compose.intranet.yaml --env-file docker/.env.intranet cp web:/etc/pyquest/tls/ca.key ./ca.key`.

## Exploitation

Toutes les commandes se lancent depuis la racine du dépôt (remplacer `vps` par `intranet` selon le cas) :

```bash
PQ="docker compose -f docker/compose.vps.yaml --env-file docker/.env.vps"
$PQ ps                                   # état des services
$PQ logs -f backend                      # journaux
$PQ exec backend python manage.py createsuperuser     # administrateur (gestion des auteurs : /api/admin/)
git pull && $PQ up -d --build            # mise à jour (les données, dans des volumes, sont conservées)
$PQ down                                 # arrêt (SANS -v : « down -v » supprime les volumes, donc les données)
```

- **Données** : volumes Docker `db` (MariaDB) ou `data` (SQLite), `letsencrypt`, `tls`. Une sauvegarde automatique de la
  base (quotidienne, 14 conservées) est écrite dans `docker/backups/` (`PYQUEST_BACKUP_DIR`) ; pense à la copier hors du
  serveur.
- **Restauration** : MariaDB, `gunzip < sauvegarde.sql.gz | $PQ exec -T db sh -c 'mariadb -u pyquest -p"$MARIADB_PASSWORD" pyquest'` ;
  SQLite, arrêter `backend` puis remplacer `/var/lib/pyquest/db.sqlite3` dans le volume `data` par la sauvegarde décompressée.
- **Renouvellement Let's Encrypt** : `certbot` vérifie deux fois par jour ; nginx recharge le certificat au plus tard six
  heures après (ou tout de suite : `$PQ exec web pyquest-tls reload`).
- **Ports** : Docker publie 80 et 443 en contournant les règles `ufw` ; restreindre l'accès avec le pare-feu du fournisseur
  si besoin. Pour des essais, `--http-port` et `--https-port` choisissent d'autres ports.
- **Limitation de débit** : elle repose sur l'adresse IP vue par nginx. Sur un hôte Docker standard c'est celle du client ;
  derrière un autre proxy, elle serait celle du proxy.

## Pare-feu de l'hôte (iptables, ufw)

Docker écrit lui-même ses règles de pare-feu (chaînes `DOCKER`, `DOCKER-USER`, traduction d'adresse). Un pare-feu
d'hôte strict peut les casser. **Symptôme typique**, dès la construction : `apk add` ou `apt-get` affichent
`DNS: transient error` ou `Temporary failure resolving`, alors que l'hôte accède à Internet. Les pannes rencontrées
sur un VPS réel (Debian, nginx et MariaDB déjà présents, pare-feu iptables maison, politiques `DROP`) :

| Cause | Comment la reconnaître | Remède |
|---|---|---|
| Le script de pare-feu vide toutes les chaînes (`iptables -F`, `-X`, `-t nat -F`) **après** le démarrage de Docker | `iptables -S DOCKER-USER` : « No chain/target/match by that name » | relancer Docker **après** le pare-feu (voir ci-dessous) |
| Deux moteurs mélangés : `iptables` en nftables, règles de Docker ou d'un autre outil en legacy | `iptables -V` affiche `(nf_tables)` et le message « iptables-legacy tables present » ; comparer `iptables-nft -S` et `iptables-legacy -S` | **un seul moteur** : celui qui contient le pare-feu de l'hôte ; ne pas basculer à la légère (on perdrait les règles). Docker utilise le moteur de la commande `iptables` |
| `FORWARD` en `DROP` sans autorisation pour les conteneurs | les conteneurs n'atteignent rien (DNS inclus) | règles `DOCKER-USER` ci-dessous |
| Règles écrites avec `iptables -I` dans le mauvais ordre | un `DROP` de l'interface publique passe avant les `ACCEPT ... ESTABLISHED` : les réponses d'Internet sont jetées | écrire avec `-A` sur une chaîne vidée (le script fourni le fait) |

### Mise en place (iptables)

Le script `docker/firewall/docker-user-rules.sh` (testé sur ce VPS) règle la chaîne `DOCKER-USER`, que Docker consulte avant
ses propres règles : tout est accepté pour les conteneurs et les réponses, **seuls les ports de `PUBLIC_PORTS`
(80 et 443) sont joignables depuis Internet**, le reste venant de l'interface publique est refusé (sans cela, tout
port publié par un conteneur serait ouvert au monde : Docker contourne les règles `INPUT`).

```bash
install -m 755 docker/firewall/docker-user-rules.sh /usr/local/sbin/docker-user-rules.sh
mkdir -p /etc/systemd/system/docker.service.d
printf '[Service]\nExecStartPost=-/usr/local/sbin/docker-user-rules.sh\n' > /etc/systemd/system/docker.service.d/firewall.conf
systemctl daemon-reload && systemctl restart docker
iptables -S DOCKER-USER                                  # les règles sont là
docker run --rm alpine apk add --no-cache bash           # le conteneur sort sur Internet
```

- Le **`-`** devant le chemin d'`ExecStartPost` est essentiel : sans lui, une erreur du script (fichier absent ou non
  exécutable : `status=203/EXEC`) arrête Docker, donc tous les conteneurs de la machine.
- Variables : `PUBLIC_PORTS="80 443 8883"` pour d'autres ports publiés par des conteneurs qui doivent rester publics ;
  `TRUSTED_IFS="wg0"` pour ne jamais filtrer un VPN. Mets-les dans l'unité (`Environment=` du même fichier `.conf`) plutôt
  que dans le script.
- **Ordre au démarrage de la machine** : le pare-feu doit s'exécuter **avant** Docker (`Before=docker.service` dans son
  service), ou se terminer par `systemctl is-active --quiet docker && systemctl restart docker`. Pour que les conteneurs
  survivent à ce redémarrage de Docker, active `"live-restore": true` dans `/etc/docker/daemon.json`.
- Ne place **pas** ces règles dans le script général du pare-feu : il vide les chaînes, donc `DOCKER-USER` n'existe pas
  encore au moment où elles s'exécuteraient.
- Pour ouvrir un test sur d'autres ports (`--http-port`, `--https-port`), ajoute-les à `PUBLIC_PORTS` le temps de
  l'essai, ou passe par ton VPN.
- Vérifie aussi qu'aucune règle générale n'annule le pare-feu : par exemple `iptables -I INPUT -m conntrack --ctstate
  NEW,ESTABLISHED -j ACCEPT` accepte **toute** nouvelle connexion entrante.

### ufw

*Non essayé ici ; consignes standard de Docker.* `ufw` ne filtre pas les ports publiés par Docker (les règles
`ufw allow/deny` ne s'y appliquent pas) : un port publié est ouvert même si `ufw` le refuse. Pour le contrôler, utilise
la même chaîne `DOCKER-USER` (le script ci-dessus fonctionne avec `ufw`, qui utilise aussi `iptables`) ou le projet
`ufw-docker`. Si les conteneurs n'ont pas de sortie, mets `DEFAULT_FORWARD_POLICY="ACCEPT"` dans `/etc/default/ufw`, puis
`ufw reload`, et autorise le trafic de `docker0` et des réseaux `br-…`.

### Autres points propres à un VPS qui héberge déjà autre chose

- **Ports 80 et 443** : un nginx sur l'hôte et la pile Docker ne peuvent pas les partager (`address already in use`).
  Pour un essai, arrêter nginx ; pour une cohabitation durable, utiliser `--http-port`/`--https-port` derrière un autre
  proxy, ou l'installation classique plutôt que Docker.
- **MariaDB de l'hôte** : sans conflit, la base de la pile Docker n'est pas publiée.
- **Let's Encrypt** : le port 80 doit être joignable depuis Internet (donc dans `PUBLIC_PORTS`).

## Vérifié

`make test-docker` construit les images, démarre les deux piles sur des ports libres, interroge nginx en HTTPS (en-têtes
d'isolation, moteur Python, éditeur protégé, administration, fichiers statiques, synchronisation, base, sauvegardes,
redémarrage du backend, persistance de l'autorité) et détruit tout. **Non vérifié en réel** : l'obtention du certificat
Let's Encrypt (le défi HTTP est testé, pas l'échange avec Let's Encrypt) et un renouvellement à l'échéance.
