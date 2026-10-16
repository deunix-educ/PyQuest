# Synchronisation entre appareils (facultative)

L'application est autonome : la progression vit dans l'IndexedDB du navigateur. La synchronisation ne
sert qu'à retrouver sa progression sur un autre appareil. Rien n'en dépend.

## Deux niveaux, indépendants

1. **Sauvegarde par fichier** (aucun serveur) : Réglages → « Exporter ma progression » télécharge un
   JSON ; « Importer une progression » le fusionne (union, rien n'est jamais perdu).
2. **Synchronisation** (serveur PyQuest avec le backend Django, même domaine via nginx).

## Principe

- Pas de compte. Au clic sur « Activer », le navigateur génère un **jeton** de 256 bits (43 caractères
  URL-safe). Le jeton est l'identifiant *et* le secret ; le serveur n'en stocke que le **SHA-256**.
- Un second appareil rejoint le profil en collant le jeton (« Lier cet appareil »).
- Le jeton reste dans l'IndexedDB (clé `sync`) ; il n'est jamais inclus dans l'export de progression.
- **Perte du jeton = pas de récupération possible** (conséquence voulue de « pas de compte »). L'export
  fichier reste le filet de sécurité.

## Protocole (`/api/sync/`, en-tête `Authorization: Bearer <jeton>`)

| Appel | Réponse |
|---|---|
| `GET` | `200 {payload, updated_at}` ou `404 {error}` (rien de stocké) |
| `PUT {payload, base}` | `200 {updated_at}` ; `409 {payload, updated_at}` si `base` ≠ version serveur ; `400` payload invalide ou trop gros (256 Ko) |
| `DELETE` | `204` : efface définitivement les données liées au jeton (droit à l'effacement) |
| (tout) | `401` sans jeton valide |

`base` est le `updated_at` lu par le client : **concurrence optimiste**. Le serveur ne fusionne jamais.

## Cycle client (`app/js/core/SyncClient.js`)

1. `GET` → fusion locale (`ProgressStore.import`, mode merge : union des niveaux et badges, meilleur streak).
2. `PUT` de l'état fusionné avec `base`. Sur `409` : fusion de l'état renvoyé, nouvel essai (4 au plus).
3. Déclencheurs : activation, démarrage, retour du réseau (`online`), onglet de nouveau visible,
   et 2 s après un changement local (debounce). Une fusion venant du serveur ne repart pas vers le serveur.

Les erreurs sont des **états** (`offline`, `unauthorized`, `unavailable`, `rejected`, `invalid`), jamais
des exceptions : l'application continue de fonctionner, la progression locale est intacte. Un `404`
non JSON (serveur statique sans Django) donne `unavailable`.

## Sécurité

- Toute donnée venant du serveur ou d'un fichier est **non fiable** : `ProgressStore` la valide
  strictement (types, bornes, identifiants `[A-Za-z0-9_-]{1,64}` hors `__proto__`) avant fusion.
- Même origine uniquement : pas de CORS, pas d'exception COEP. En dev : `make dev-sync`.
- nginx : limite de débit et taille de corps (voir `nginx/pyquest.conf.example`).

## Backend : aussi l'accès à l'éditeur (2026-10-16)

Le même backend Django porte les comptes (`authors/`) : page de connexion de l'éditeur, `check` pour nginx
`auth_request`, anti force brute commun (`throttle.py`, `LoginFailure`), **administration Django** sur `/api/admin/`
(`sites.py` : même limitation des essais). Deux rôles : administrateur (`is_staff`) et auteur (permission
`authors.use_editor`, groupe « Auteurs », actions « Autoriser/Retirer » dans la liste des utilisateurs) ; `is_staff` seul
n'ouvre pas l'éditeur. Commande `create_author` en raccourci. Base de
production : **MariaDB** (`mysqlclient`, `backend/requirements-prod.txt`). Les fichiers de l'éditeur ne sont ni
pré-cachés ni interceptés par le service worker (`build.py:is_author_tool`, `service-worker.js`).

## Non fait (volontairement)

- QR code du jeton (aurait demandé une dépendance) : copier/coller suffit pour l'instant.
- URL de serveur configurable (implique CORS) : l'API est toujours `api/sync/` sur le domaine de l'app.
