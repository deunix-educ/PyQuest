# Déploiement

PyQuest est une **application statique** : un serveur web suffit. Un backend Django est **facultatif** (synchronisation
de la progression).

## Prérequis

Python 3.12+, Node.js 20+, `make`, `curl`.

## Construire

```bash
make install     # outils de développement + Pyodide épinglé dans vendor/pyodide
make build       # produit dist/ (application statique)
```

Servir le contenu de `dist/` à la **racine d'un domaine**, en **HTTPS**.

## En-têtes obligatoires

Pour interrompre proprement une boucle infinie et permettre la saisie `input()`, le site doit être **isolé** :

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

Sans eux, l'application fonctionne mais doit redémarrer son moteur pour arrêter un programme, et `input()` est
indisponible. Conséquence : **tout est servi depuis le même domaine**, y compris le moteur Python (Pyodide,
jamais depuis un CDN) et les polices.

Un exemple complet de configuration nginx (types MIME, en-têtes, cache, API) est fourni dans
`nginx/pyquest.conf.example`.

## Installer sur un VPS

Le serveur se met en place **depuis un clone du dépôt, directement sur le VPS, en root** : le site est construit sur
place, puis publié par versions successives avec bascule atomique du lien `current`. Le dépôt se clone sous le nom
`PyQuest` (par exemple `/opt/PyQuest`, hors de `/root` et `/home`).

```bash
git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest
cd /opt/PyQuest
./deploy/server_setup.sh --domain pyquest.example.org --dry-run      # simulation
./deploy/server_setup.sh --domain pyquest.example.org --certbot toi@mail
```

Toute la marche à suivre (base MariaDB, démarrage du service, premier administrateur, publication, sauvegardes,
retour arrière, dépannage) est dans [Mise en service et exploitation](operations.md).

## Tester en local avant de déployer

Trois niveaux d'essai, du plus simple au plus fidèle à la production :

| Commande | Ce qu'elle lance | Ce qu'elle permet d'essayer |
|---|---|---|
| `make dev` | serveur de développement (`http://127.0.0.1:8000/`) | l'application seule |
| `make dev-sync` | idem + backend Django, `/api/` relayé | synchronisation, page de connexion (`/api/auth/login/`) ; l'éditeur n'y est **pas** protégé |
| `make dev-nginx` | **nginx réel** + Django + `dist/` (`http://127.0.0.1:8080/`) | tout : en-têtes d'isolation, types MIME, éditeur protégé par connexion, synchronisation |

`make dev-nginx` utilise **les mêmes blocs que la production** (`nginx/pyquest-locations.conf.example`) : ce que tu
vois en local est ce qui sera déployé. Il construit `dist/`, crée une base SQLite jetable dans `.local/stack/`, propose
de créer un compte auteur, puis lance nginx et Django. **Il n'existe aucun compte par défaut** : au premier lancement, dans un terminal, il te
demande de créer le compte **administrateur** (mot de passe de 12 caractères minimum). Sinon : `make dev-admin`. Connecte-toi
sur `http://127.0.0.1:8080/api/admin/` pour créer des auteurs et leur donner l'accès à l'éditeur ; un administrateur peut
aussi ouvrir l'éditeur. Raccourci sans passer par l'administration : `make dev-author NAME=ada` (`RESET=--reset` pour
changer le mot de passe). Arrêt avec `Ctrl + C`. Journaux : `.local/stack/logs/`.

nginx n'a pas besoin d'être installé comme service : seul le binaire est utilisé. Le plus simple (Debian/Ubuntu, sans droits administrateur) : `make fetch-nginx`, qui l'extrait dans `.local/nginx/` ; `make dev-nginx` le trouve alors tout seul. À la main :

```bash
mkdir -p /tmp/ngx && cd /tmp/ngx && apt-get download nginx && dpkg -x nginx_*.deb root
PYQUEST_NGINX=/tmp/ngx/root/usr/sbin/nginx make dev-nginx
```

(la variable est `PYQUEST_NGINX` : nginx lit lui-même une variable nommée `NGINX`, qui ne convient pas.)

**Parcours à essayer** sur `http://127.0.0.1:8080/` :

1. L'application s'ouvre ; un niveau avec `input()` (niveau 03) fonctionne : l'isolation est active.
2. `http://127.0.0.1:8080/author.html` **redirige vers la page de connexion**. Un mauvais mot de passe est refusé ; le
   bon compte arrive sur l'éditeur ; « Se déconnecter » (sur la page de connexion) referme l'accès.
3. **Réglages → Synchronisation → Activer** fonctionne (la ligne « Dernière synchronisation » apparaît).
4. Vérifier un site (local ou distant) : `make check-deploy URL=http://127.0.0.1:8080`.

Les tests automatiques font ce parcours : `make test-e2e` inclut `tests/e2e/nginx.test.mjs` (ignoré si aucun binaire
nginx n'est trouvé).

## Mise en cache

Un service worker rend l'application utilisable hors ligne : pages et scripts en **réseau d'abord** (une mise à jour
est vue dès le rechargement), moteur Python en **cache d'abord** (fichiers versionnés et immuables).

## Backend Django (facultatif) : synchronisation et accès à l'éditeur

Le backend Django sert à **deux choses**, toutes deux facultatives : synchroniser la progression entre appareils, et
**protéger l'accès à l'éditeur de niveaux** (`author.html`) par une connexion, avec une **administration** pour gérer les
comptes. L'application d'apprentissage
fonctionne entièrement sans lui.

`./deploy/server_setup.sh` (voir ci-dessus) fait l'essentiel ; voici ce qu'il met en place, et ce qui reste à faire à la main.

1. **Base de données : MariaDB** (ou MySQL ; Django 5.2 exige MariaDB 10.5 ou plus), à créer **à la main** avec une base et
   un utilisateur dédiés (`utf8mb4`) : adapte puis exécute `deploy/mariadb-setup.sql.example` (`mariadb < …`).
2. **Environnement Python** dans le dépôt (`/opt/PyQuest/.venv-prod`), avec `backend/requirements-prod.txt` (Django,
   gunicorn, `mysqlclient` qui se compile : paquets `pkg-config libmariadb-dev build-essential python3-dev`).
3. **Variables d'environnement** dans `/etc/pyquest/env` (droits 640, `root:pyquest`, jamais commité ; modèle :
   `deploy/pyquest.env.example`) : `PYQUEST_SECRET_KEY` (**générée** à l'installation), `PYQUEST_ALLOWED_HOSTS`,
   `PYQUEST_ORIGIN` (`https://ton-domaine.example`), `PYQUEST_DB_NAME`, `PYQUEST_DB_USER`, `PYQUEST_DB_PASSWORD` (**à
   remplir**), `PYQUEST_DB_HOST` (défaut `127.0.0.1`), `PYQUEST_DB_PORT` (défaut `3306`), `PYQUEST_STATIC_ROOT` (défaut
   `/var/www/pyquest/static`) et `DJANGO_SETTINGS_MODULE=pyquest_api.settings.production`.
4. **Service systemd `pyquest`** (`deploy/pyquest.service.example`) : gunicorn sur `127.0.0.1:8001`, utilisateur système
   `pyquest` ; au démarrage il applique les migrations et collecte les fichiers statiques de l'administration.
5. **nginx** : `nginx/pyquest.conf.example` (vhost) et les extraits `pyquest-locations.conf` et
   `pyquest-author-headers.conf` dans `/etc/nginx/snippets/` ; `/api/` est relayé vers le service, **sur le même domaine**.

Les commandes Django de production passent par `./scripts/server_manage.sh` (lit `/etc/pyquest/env` sans le « sourcer » et
utilise le bon environnement Python), par exemple `./scripts/server_manage.sh migrate`.

### Administration et comptes auteurs

Deux notions distinctes :

- les **administrateurs** (`is_staff`) ouvrent l'**administration Django** sur `/api/admin/` : ils créent les comptes,
  les désactivent, changent les mots de passe et décident **qui peut utiliser l'éditeur de niveaux** ;
- les **auteurs** (permission « Peut utiliser l'éditeur de niveaux », donnée par le groupe **Auteurs**) ouvrent
  l'éditeur (`author.html`) et rien d'autre : ils n'ont aucun accès à l'administration.

**Premier administrateur** (sur le serveur, une seule fois) :

```bash
./scripts/server_manage.sh createsuperuser     # mot de passe de 12 caractères minimum
```

Les fichiers statiques de l'administration sont collectés par le service au démarrage dans `PYQUEST_STATIC_ROOT`
(défaut `/var/www/pyquest/static`), que nginx sert sous `/api/static/` (`alias` de `pyquest-locations.conf`).

**Gérer les auteurs** : ouvre `https://ton-domaine.example/api/admin/`, connecte-toi, puis **Utilisateurs** :

- cocher des comptes, choisir l'action **« Autoriser à utiliser l'éditeur de niveaux »** (ou **« Retirer l'accès… »**),
  puis **Envoyer** : la colonne **Éditeur de niveaux** indique l'état ;
- **Ajouter un utilisateur** crée un compte (identifiant, mot de passe) ; ajoute-le ensuite au groupe **Auteurs**, ou
  utilise l'action ci-dessus ;
- désactiver un compte (case « Actif ») lui retire tout accès à la prochaine vérification.

En ligne de commande, `./scripts/server_manage.sh create_author ada` crée directement un compte auteur sans passer par
l'administration ; `--reset` change son mot de passe, `--admin` en fait un administrateur (accès à `/api/admin/`).

Un administrateur peut aussi utiliser l'éditeur (un superutilisateur a toutes les permissions). Le simple statut
`is_staff` **ne suffit pas** à ouvrir l'éditeur.

**Sécurité** :

- session de 8 heures, cookie `HttpOnly` et `Secure`, formulaires protégés contre le CSRF, pages non intégrables dans
  un cadre (`X-Frame-Options`) ;
- **anti force brute** commun à la connexion de l'éditeur et à celle de l'administration : après 5 échecs sur un compte
  (ou 20 depuis une adresse) en 15 minutes, les connexions sont refusées ; nginx limite aussi le débit ;
- pour réduire encore l'exposition de `/api/admin/`, décommente `allow` / `deny` dans `pyquest-locations.conf` (limiter à
  ton réseau) ou n'y accède que par VPN ;
- pas de récupération de mot de passe par e-mail : un administrateur le change (administration ou
  `create_author --reset`).

### Vie privée

Pour la synchronisation, le serveur stocke, pour chaque jeton, **l'empreinte du jeton** (SHA-256) et le **JSON de
progression** (niveaux terminés, badges, série). Pas de compte apprenant, pas d'adresse e-mail, pas de statistiques.
L'utilisateur peut tout effacer depuis les réglages (route `DELETE`). Les comptes (auteurs, administrateurs) ne contiennent qu'un
identifiant et l'empreinte (hachée) du mot de passe.

## Sans backend

Servir `dist/` suffit (`nginx/pyquest-static.conf.example`). La section « Synchronisation » des réglages indique alors
qu'aucun serveur n'est disponible, et la sauvegarde par fichier reste utilisable. L'éditeur de niveaux (`author.html`)
est alors **public** : pour ne pas l'exposer, utilise le backend ci-dessus ou supprime-le de `dist/` avant l'envoi.
