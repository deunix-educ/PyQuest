# API de synchronisation

Disponible seulement si le backend Django est déployé. Elle est toujours sur le **même domaine** que l'application :
`/api/sync/`.

## Authentification

Chaque requête porte un **jeton** : `Authorization: Bearer <jeton>`. Le jeton est généré par le client (256 bits,
43 caractères URL-safe ; le serveur accepte 32 à 128 caractères `A-Za-z0-9_-`). Le serveur n'en conserve que le
**SHA-256**. Il n'y a ni compte ni cookie (donc pas de CSRF).

## Appels

| Appel | Réponse |
|---|---|
| `GET /api/sync/` | `200 {"payload": …, "updated_at": …}` ; `404 {"error": …}` si rien n'est stocké |
| `PUT /api/sync/` avec `{"payload": …, "base": …}` | `200 {"updated_at": …}` ; `409` si `base` est périmée ; `400` payload invalide ou trop gros |
| `DELETE /api/sync/` | `204` : efface définitivement les données de ce jeton (idempotent) |
| tout appel sans jeton valide | `401 {"error": …}` |

- `payload` : l'objet exporté par l'application (`version`, `completedLevels`, `badges`, `streak`). Taille maximale :
  256 Ko.
- `base` (facultatif) : le `updated_at` lu par le client. S'il ne correspond plus à la version du serveur
  (un autre appareil a écrit entre-temps), le serveur répond **`409`** avec l'état courant
  (`payload`, `updated_at`) : le client fusionne et réessaie. C'est une **concurrence optimiste**.

## Qui fusionne ?

**Le client.** Le serveur stocke le dernier JSON reçu et ne fusionne rien. La fusion garde l'union des niveaux
terminés et des badges, le maximum de la meilleure série, et la série courante de l'appareil le plus récemment actif.

## Cycle du client

1. `GET` puis fusion locale ;
2. `PUT` de l'état fusionné avec `base` ; sur `409`, fusion de l'état reçu et nouvel essai (4 au plus) ;
3. déclenché à l'activation, au démarrage, au retour du réseau, quand l'onglet redevient visible et 2 secondes après
   un changement local.

Les erreurs sont des états visibles (`hors ligne`, `jeton refusé`, `serveur indisponible`, `données refusées`,
`données invalides`) et ne bloquent jamais l'application. Un `404` qui n'est pas du JSON (serveur statique sans
Django) est traité comme « serveur indisponible ».

## Accès à l'éditeur (comptes auteurs)

Le même backend expose, pour nginx et pour la page de connexion :

| Appel | Rôle |
|---|---|
| `GET /api/auth/check/` | `204` si la session appartient à un compte actif ayant la permission `authors.use_editor` (groupe « Auteurs »), sinon `401` ; utilisé par `auth_request` de nginx (non joignable de l'extérieur) |
| `GET /api/auth/login/` | formulaire de connexion (français ou anglais selon `Accept-Language`) |
| `POST /api/auth/login/` | connexion (CSRF) ; `302` vers `next` (chemin local uniquement), `200` avec message si refusé, `429` si trop d'essais |
| `GET /api/auth/me/` | `200 {username, csrf}` pour un auteur connecté (affichage du nom et jeton du bouton de déconnexion de l'éditeur), sinon `401` |
| `POST /api/auth/logout/` | déconnexion (CSRF) ; redirige vers la page de connexion |
| `/api/admin/` | administration Django (comptes, groupe « Auteurs ») ; fichiers statiques sous `/api/static/` |

## Sécurité

Toute donnée reçue du serveur ou d'un fichier est considérée comme non fiable et validée strictement avant fusion
(types, bornes, identifiants). Le serveur impose la taille maximale ; nginx limite le débit.
