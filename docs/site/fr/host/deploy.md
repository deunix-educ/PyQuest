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

## Déployer sur un VPS, pas à pas

Hypothèses : un VPS Linux avec **nginx**, un **nom de domaine** qui pointe vers lui, et un accès **SSH par clé**.

**1. Sur le VPS (une seule fois)**

```bash
sudo mkdir -p /var/www/pyquest /var/www/letsencrypt
sudo chown "$USER" /var/www/pyquest          # l'utilisateur SSH doit pouvoir écrire ici
sudo apt install nginx certbot rsync
```

Installe ensuite le vhost : copie `nginx/pyquest-static.conf.example` (sans backend ; avec le backend Django, `nginx/pyquest.conf.example`, voir plus bas) vers `/etc/nginx/sites-available/pyquest` et
remplace `pyquest.example.org` par ton domaine. Le certificat n'existe pas encore : **commente d'abord le second
bloc `server`** (celui du port 443), puis :

```bash
sudo ln -s /etc/nginx/sites-available/pyquest /etc/nginx/sites-enabled/pyquest
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt -d ton-domaine.example   # Let's Encrypt
```

Décommente alors le bloc 443 et recharge nginx (`sudo nginx -t && sudo systemctl reload nginx`). Le renouvellement du
certificat est automatique (minuteur `certbot` du paquet) ; il reste à recharger nginx après renouvellement :
`sudo sh -c 'printf "#!/bin/sh\nsystemctl reload nginx\n" > /etc/letsencrypt/renewal-hooks/deploy/nginx && chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx'`.

**2. Sur ta machine : déployer**

```bash
make install
DEPLOY_HOST=utilisateur@ton-domaine.example make deploy
```

`make deploy` construit `dist/`, envoie les fichiers dans `releases/<date>-<commit>/` sur le VPS (seuls les fichiers
modifiés voyagent), puis bascule le lien `current` **d'un seul coup** : le site n'est jamais à moitié à jour. Les
3 dernières versions sont conservées. Variables : `DEPLOY_PATH` (défaut `/var/www/pyquest`), `DEPLOY_KEEP`.
`./scripts/deploy.sh --dry-run` montre ce qui serait envoyé sans rien modifier.

**3. Vérifier**

```bash
make check-deploy URL=https://ton-domaine.example
```

Le contrôle vérifie les en-têtes d'isolation, les types MIME, le moteur Python, le service worker et la
redirection HTTPS. Ouvre ensuite le site : un niveau avec `input()` (niveau 03) confirme que l'isolation fonctionne.

**4. Mettre à jour ou revenir en arrière**

```bash
DEPLOY_HOST=utilisateur@ton-domaine.example make deploy                    # nouvelle version
DEPLOY_HOST=utilisateur@ton-domaine.example ./scripts/deploy.sh --rollback  # version précédente
```

Les navigateurs récupèrent la nouvelle version au rechargement (pages et scripts passent par le réseau d'abord).

!!! warning "En cas de problème"
    - **`input()` indisponible, ou arrêt d'une boucle qui redémarre le moteur** : les en-têtes COOP/COEP/CORP
      manquent. `make check-deploy` le dit.
    - **Page blanche, scripts refusés** : type MIME incorrect (un bloc `types` oublié ou incomplet).
    - **Ancienne version affichée** : vérifie que `service-worker.js` est bien servi avec `Cache-Control: no-cache`.
    - Le script n'utilise jamais `sudo` ni de mot de passe : seule ta clé SSH sert, et rien de secret n'est dans le dépôt.

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

1. **Base de données : MariaDB** (ou MySQL). Crée une base et un utilisateur dédiés (jeu de caractères `utf8mb4`) :

    ```sql
    CREATE DATABASE pyquest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER 'pyquest'@'localhost' IDENTIFIED BY '…un mot de passe long…';
    GRANT ALL PRIVILEGES ON pyquest.* TO 'pyquest'@'localhost';
    ```

2. **Installer** dans un environnement virtuel dédié (Django 5.2 exige MariaDB 10.5 ou plus) :

    ```bash
    sudo apt install pkg-config libmariadb-dev build-essential python3-dev   # pour compiler mysqlclient
    python3 -m venv /opt/pyquest/venv
    /opt/pyquest/venv/bin/pip install -r backend/requirements-prod.txt
    ```

3. **Variables d'environnement** (jamais commitées ; par exemple dans un fichier lu par l'unité systemd, droits `600`) :
   `PYQUEST_SECRET_KEY` (longue chaîne aléatoire), `PYQUEST_ALLOWED_HOSTS` (ton domaine), `PYQUEST_ORIGIN`
   (`https://ton-domaine.example`), `PYQUEST_DB_NAME`, `PYQUEST_DB_USER`, `PYQUEST_DB_PASSWORD`, et si besoin
   `PYQUEST_DB_HOST` (défaut `127.0.0.1`), `PYQUEST_DB_PORT` (défaut `3306`) et `PYQUEST_STATIC_ROOT` (défaut
   `/var/www/pyquest/static`, fichiers statiques de l'administration). Réglages :
   `DJANGO_SETTINGS_MODULE=pyquest_api.settings.production`.
4. **Créer les tables** : `python manage.py migrate` (dossier `backend/`).
5. **Lancer** avec `gunicorn` sur `127.0.0.1:8001` (`gunicorn pyquest_api.wsgi --bind 127.0.0.1:8001`), géré par
   systemd. nginx relaie `/api/` vers lui, **sur le même domaine** : utilise `nginx/pyquest.conf.example`, et copie
   `nginx/pyquest-locations.conf.example` et `nginx/pyquest-author-headers.conf.example` dans `/etc/nginx/snippets/` sous les
   noms `pyquest-locations.conf` et `pyquest-author-headers.conf`.

### Administration et comptes auteurs

Deux notions distinctes :

- les **administrateurs** (`is_staff`) ouvrent l'**administration Django** sur `/api/admin/` : ils créent les comptes,
  les désactivent, changent les mots de passe et décident **qui peut utiliser l'éditeur de niveaux** ;
- les **auteurs** (permission « Peut utiliser l'éditeur de niveaux », donnée par le groupe **Auteurs**) ouvrent
  l'éditeur (`author.html`) et rien d'autre : ils n'ont aucun accès à l'administration.

**Premier administrateur** (sur le serveur, une seule fois) :

```bash
cd backend && python manage.py createsuperuser     # mot de passe de 12 caractères minimum
python manage.py collectstatic --noinput           # fichiers de l'administration, servis par nginx
```

`collectstatic` écrit dans `PYQUEST_STATIC_ROOT` (défaut `/var/www/pyquest/static`), que nginx sert sous `/api/static/`
(`alias` du fichier `pyquest-locations.conf`). À refaire après une mise à jour de Django.

**Gérer les auteurs** : ouvre `https://ton-domaine.example/api/admin/`, connecte-toi, puis **Utilisateurs** :

- cocher des comptes, choisir l'action **« Autoriser à utiliser l'éditeur de niveaux »** (ou **« Retirer l'accès… »**),
  puis **Envoyer** : la colonne **Éditeur de niveaux** indique l'état ;
- **Ajouter un utilisateur** crée un compte (identifiant, mot de passe) ; ajoute-le ensuite au groupe **Auteurs**, ou
  utilise l'action ci-dessus ;
- désactiver un compte (case « Actif ») lui retire tout accès à la prochaine vérification.

En ligne de commande, `python manage.py create_author ada` crée directement un compte auteur sans passer par
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
