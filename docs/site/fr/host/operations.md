# Mise en service et exploitation

Cette page est la **feuille de route** pour installer PyQuest sur un VPS, puis l'exploiter. Elle s'appuie sur des
scripts testés (sans serveur) ; ce qui touche le VPS lui-même n'a pas pu être essayé en réel avant la première
installation : commence toujours par `--dry-run` et `vps-doctor`.

## À avoir sous la main

- l'adresse SSH du VPS et ta clé (`utilisateur@hote`), l'utilisateur ayant `sudo` ;
- le **nom de domaine**, qui pointe déjà vers le VPS (enregistrement A/AAAA) ;
- une adresse e-mail (avis d'expiration Let's Encrypt) ;
- la version de **MariaDB** en place (10.5 ou plus) et un accès administrateur pour y créer une base ;
- nginx 1.25.1 ou plus de préférence (sinon voir le commentaire `http2` dans les exemples).

## Première installation (dans l'ordre)

| # | Où | Commande | Résultat |
|---|---|---|---|
| 1 | ta machine | `make ci` | tout est vert avant d'envoyer |
| 2 | ta machine | `DEPLOY_HOST=u@h make vps-bootstrap DOMAIN=pyquest.example.org ARGS=--dry-run` | **simulation** : rien n'est écrit sur le VPS |
| 3 | ta machine | `DEPLOY_HOST=u@h make vps-bootstrap DOMAIN=pyquest.example.org ARGS="--certbot toi@mail"` | paquets, utilisateur `pyquest`, dossiers, environnement Python, fichier d'environnement (clé secrète générée), service systemd, nginx, certificat |
| 4 | VPS | adapter puis `sudo mariadb < deploy/mariadb-setup.sql.example` | base `pyquest` et son utilisateur |
| 5 | VPS | mettre le mot de passe de la base dans `/etc/pyquest/env` (`PYQUEST_DB_PASSWORD`) | le service pourra se connecter |
| 6 | VPS | `sudo systemctl enable --now pyquest` | migrations et statiques appliqués au démarrage |
| 7 | VPS | `createsuperuser` (commande affichée à la fin de l'installation) | premier administrateur |
| 8 | ta machine | `DEPLOY_HOST=u@h make deploy` | le site est en ligne |
| 9 | ta machine | `make check-deploy URL=https://pyquest.example.org` | en-têtes, types MIME, moteur Python, redirection HTTPS |
| 10 | ta machine | `DEPLOY_HOST=u@h make vps-doctor` | tout est « ok » |

Puis, dans un navigateur : le niveau 03 (`input()`), `/author.html` (renvoie vers la connexion), `/api/admin/`
(administration), et **Réglages → Synchronisation → Activer**.

Les scripts sont **idempotents** : on peut les relancer après une erreur ; ils ne remplacent jamais un fichier de
configuration ou un secret déjà présent.

## Ce que fait l'installation, concrètement

| Élément | Emplacement sur le VPS |
|---|---|
| Site statique (versions successives) | `/var/www/pyquest/releases/…`, lien `current` |
| Fichiers statiques de l'administration | `/var/www/pyquest/static` |
| Code du backend | `/opt/pyquest/backend` |
| Environnement Python | `/opt/pyquest/venv` |
| Secrets et réglages | `/etc/pyquest/env` (droits 640, `root:pyquest`) |
| Service | `pyquest.service` (gunicorn, `127.0.0.1:8001`, utilisateur système `pyquest`) |
| nginx | `/etc/nginx/sites-available/pyquest`, extraits dans `/etc/nginx/snippets/` |
| Sauvegardes | `/var/backups/pyquest` |

Le seul droit donné sans mot de passe à ton utilisateur est `systemctl restart|status pyquest`
(`/etc/sudoers.d/pyquest`).

## Exploitation courante

| Je veux… | Commande |
|---|---|
| publier une nouvelle version du site | `DEPLOY_HOST=u@h make deploy` |
| revenir à la version précédente du site | `DEPLOY_HOST=u@h ./scripts/deploy.sh --rollback` |
| publier une nouvelle version du backend | `DEPLOY_HOST=u@h make deploy-backend` (redémarre le service ; migrations automatiques) |
| voir l'état du serveur | `DEPLOY_HOST=u@h make vps-doctor` |
| lire les journaux | `journalctl -u pyquest -f` ; `/var/log/nginx/error.log` |
| gérer les auteurs | `https://domaine/api/admin/` |
| contrôler le site publié | `make check-deploy URL=https://domaine` |

### Sauvegarde de la base

Elle contient les progressions synchronisées et les comptes. `scripts/backup_db.sh` fait un export compressé, vérifié
(une sauvegarde vide est refusée), dans `/var/backups/pyquest`, et garde les 14 dernières. Les identifiants sont lus
dans `/etc/pyquest/env`, jamais passés en ligne de commande.

```bash
sudo ./scripts/backup_db.sh                         # à la main
echo '30 3 * * *  root  /opt/pyquest/scripts/backup_db.sh' | sudo tee /etc/cron.d/pyquest-backup   # chaque nuit
gunzip < /var/backups/pyquest/pyquest-AAAAMMJJ-HHMMSS.sql.gz | sudo mariadb pyquest                # restauration
```

(L'installation place le script dans `/opt/pyquest/scripts/`.) Pense à sortir les sauvegardes du VPS (copie vers une autre machine).

### Mises à jour de sécurité

`sudo apt update && sudo apt upgrade` régulièrement ; après une mise à jour de Django
(`pip install -r backend/requirements-prod.txt`), relance `make deploy-backend`. Le certificat se renouvelle seul
(minuteur `certbot`) ; `vps-doctor` signale une expiration proche.

## Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| `vps-doctor` : service `pyquest` inactif | mot de passe de la base absent ou faux | `journalctl -u pyquest -n 50`, corriger `/etc/pyquest/env` |
| l'API répond 500 | base injoignable | `systemctl status mariadb`, vérifier `PYQUEST_DB_*` |
| page de connexion : « Forbidden (CSRF) » | `PYQUEST_ORIGIN` incorrect | doit valoir exactement `https://domaine` |
| administration sans style | statiques absents | `sudo systemctl restart pyquest` (relance `collectstatic`) |
| `input()` indisponible | en-têtes COOP/COEP absents | `make check-deploy` ; vérifier les extraits nginx |
| 502 sur `/api/` | service arrêté | `sudo systemctl status pyquest` |
| 503 sur la connexion | limite de débit nginx dépassée | attendre une minute |
| connexion refusée « Trop d'essais » | 5 échecs en 15 minutes | attendre 15 minutes |

## Reprendre le travail plus tard

L'état d'avancement du déploiement et les prochaines étapes sont dans `CONTEXT.md` (section « Déploiement sur le
VPS »). Pour reprendre une session : le lire, lancer `make ci`, puis `make vps-doctor` pour voir où en est le serveur.
