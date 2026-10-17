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

## Vérifié

`make test-docker` construit les images, démarre les deux piles sur des ports libres, interroge nginx en HTTPS (en-têtes
d'isolation, moteur Python, éditeur protégé, administration, fichiers statiques, synchronisation, base, sauvegardes,
redémarrage du backend, persistance de l'autorité) et détruit tout. **Non vérifié en réel** : l'obtention du certificat
Let's Encrypt (le défi HTTP est testé, pas l'échange avec Let's Encrypt) et un renouvellement à l'échéance.
