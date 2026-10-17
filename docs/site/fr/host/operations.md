# Mise en service et exploitation

Marche à suivre pour installer PyQuest sur un VPS, puis l'exploiter. Tout se fait **sur le VPS, en root, depuis un clone
du dépôt** (nom du dossier : `PyQuest`). Les scripts sont testés sans serveur ; ce qui touche le VPS lui-même n'a pas pu
être essayé en réel avant la première installation : commence par `--dry-run` et `vps_doctor.sh`.

## À avoir sous la main

- l'accès **root** au VPS (SSH) et le **nom de domaine**, qui pointe déjà vers lui (enregistrement A/AAAA) ;
- une adresse e-mail (avis d'expiration Let's Encrypt) ;
- la version de **MariaDB** en place (10.5 ou plus) et son accès administrateur pour y créer une base ;
- de quoi **cloner le dépôt** : en HTTPS si le dépôt est public, sinon une clé de déploiement (lecture seule) :
  `ssh-keygen -t ed25519 -f ~/.ssh/pyquest_deploy`, à ajouter dans GitHub (*Settings → Deploy keys*) ;
- nginx 1.25.1 ou plus de préférence (sinon voir le commentaire `http2` dans les exemples).

## Première installation (dans l'ordre, en root sur le VPS)

| # | Commande | Résultat |
|---|---|---|
| 1 | `git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest && cd /opt/PyQuest` | le code, dans un dossier nommé `PyQuest` hors de `/root` et `/home` |
| 2 | `./deploy/server_setup.sh --domain pyquest.example.org --dry-run` | **simulation** : rien n'est écrit |
| 3 | `./deploy/server_setup.sh --domain pyquest.example.org --certbot toi@mail` | paquets, utilisateur `pyquest`, dossiers, environnement Python, `/etc/pyquest/env` (clé secrète générée), service systemd, nginx, certificat |
| 4 | adapter puis `mariadb < deploy/mariadb-setup.sql.example` | base `pyquest` et son utilisateur |
| 5 | mettre le mot de passe de la base dans `/etc/pyquest/env` (`PYQUEST_DB_PASSWORD`) | le service pourra se connecter |
| 6 | `systemctl enable --now pyquest` | migrations et statiques appliqués au démarrage |
| 7 | `./scripts/server_manage.sh createsuperuser` | premier administrateur |
| 8 | `./scripts/server_update.sh` | le site est construit, publié, contrôlé |
| 9 | `./scripts/vps_doctor.sh` | tout est « ok » |

Puis, dans un navigateur : le niveau 03 (`input()`), `/author.html` (renvoie vers la connexion), `/api/admin/`
(administration), et **Réglages → Synchronisation → Activer**.

Les scripts sont **idempotents** : on peut les relancer après une erreur ; ils ne remplacent jamais un fichier de
configuration ou un secret déjà présent. `server_setup.sh` refuse un dépôt sous `/root` ou `/home` (le service tourne sous
l'utilisateur système `pyquest` et doit pouvoir lire le code).

## Ce que fait l'installation, concrètement

| Élément | Emplacement sur le VPS |
|---|---|
| Dépôt cloné (code du backend, scripts) | `/opt/PyQuest` |
| Environnement Python du backend | `/opt/PyQuest/.venv-prod` |
| Site publié (versions successives) | `/var/www/pyquest/releases/…`, lien `current` |
| Fichiers statiques de l'administration | `/var/www/pyquest/static` |
| Secrets et réglages | `/etc/pyquest/env` (droits 640, `root:pyquest`) |
| Service | `pyquest.service` (gunicorn, `127.0.0.1:8001`, utilisateur système `pyquest`) |
| nginx | `/etc/nginx/sites-available/pyquest`, extraits dans `/etc/nginx/snippets/` |
| Sauvegardes | `/var/backups/pyquest` |

Les noms système (`pyquest` pour le service, l'utilisateur et `/etc/pyquest`) restent en minuscules, comme le veut la
convention Linux ; seul le dossier du dépôt s'appelle `PyQuest`.

## Exploitation courante (en root, dans `/opt/PyQuest`)

| Je veux… | Commande |
|---|---|
| mettre à jour le site **et** le backend | `./scripts/server_update.sh` (git pull, construction, publication atomique, dépendances, redémarrage, contrôle) |
| revenir à la version précédente du site | `./scripts/server_update.sh --rollback` |
| simuler une mise à jour | `./scripts/server_update.sh --dry-run` |
| voir l'état du serveur | `./scripts/vps_doctor.sh` |
| contrôler le site publié | `./scripts/check_deploy.sh https://domaine` |
| gérer les auteurs | `https://domaine/api/admin/` ou `./scripts/server_manage.sh create_author ada` |
| lire les journaux | `journalctl -u pyquest -f` ; `/var/log/nginx/error.log` |

`server_update.sh` utilise `git pull --ff-only` : il refuse de continuer si le dépôt du serveur contient des
modifications locales (ne modifie pas le code sur le serveur ; modifie-le sur ta machine, pousse, puis mets à jour).
Options : `--no-pull`, `--no-build`, `--no-restart`, `--no-check`.

### Sauvegarde de la base

Elle contient les progressions synchronisées et les comptes. `scripts/backup_db.sh` fait un export compressé, vérifié
(une sauvegarde vide est refusée), dans `/var/backups/pyquest`, et garde les 14 dernières. Les identifiants sont lus
dans `/etc/pyquest/env`, jamais passés en ligne de commande.

```bash
/opt/PyQuest/scripts/backup_db.sh                                                              # à la main
echo '30 3 * * *  root  /opt/PyQuest/scripts/backup_db.sh' > /etc/cron.d/pyquest-backup          # chaque nuit
gunzip < /var/backups/pyquest/pyquest-AAAAMMJJ-HHMMSS.sql.gz | mariadb pyquest                  # restauration
```

Pense à sortir les sauvegardes du VPS (copie vers une autre machine).

### Mises à jour de sécurité

`apt update && apt upgrade` régulièrement. Après une mise à jour de Django, `./scripts/server_update.sh` réinstalle les
dépendances et redémarre le service. Le certificat se renouvelle seul (minuteur `certbot`) ; `vps_doctor.sh` signale
une expiration proche.

## Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| `vps_doctor.sh` : service `pyquest` inactif | mot de passe de la base absent ou faux | `journalctl -u pyquest -n 50`, corriger `/etc/pyquest/env` |
| l'API répond 500 | base injoignable | `systemctl status mariadb`, vérifier `PYQUEST_DB_*` |
| page de connexion : « Forbidden (CSRF) » | `PYQUEST_ORIGIN` incorrect | doit valoir exactement `https://domaine` |
| administration sans style | statiques absents | `systemctl restart pyquest` (relance `collectstatic`) |
| `input()` indisponible | en-têtes COOP/COEP absents | `./scripts/check_deploy.sh` ; vérifier les extraits nginx |
| 502 sur `/api/` | service arrêté | `systemctl status pyquest` |
| 503 sur la connexion | limite de débit nginx dépassée | attendre une minute |
| connexion refusée « Trop d'essais » | 5 échecs en 15 minutes | attendre 15 minutes |
| `server_setup.sh` : « pyquest ne peut pas lire » | dépôt dans un dossier non accessible | cloner sous `/opt` |

## Reprendre le travail plus tard

L'état d'avancement du déploiement et les prochaines étapes sont dans `CONTEXT.md` (section « Déploiement sur le
VPS »). Pour reprendre une session : le lire, lancer `make ci` sur ta machine, puis `./scripts/vps_doctor.sh` sur le VPS.
