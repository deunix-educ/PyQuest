# PyQuest

Apprendre Python par la pratique, **directement dans le navigateur** : aucune installation,
fonctionne hors ligne (PWA), pour les débutants comme pour les plus avancés.

- Python réel (CPython compilé en WebAssembly via [Pyodide](https://pyodide.org)), exécuté dans un
  Web Worker : les vrais messages d'erreur, traduits en langage simple.
- Console à cellules façon notebook, indices progressifs, validation automatique des exercices.
- Niveaux déclaratifs (YAML) : ajouter un niveau ne demande aucune modification du code.
- Éditeur de niveaux intégré (mode auteur) pour contribuer sans écrire de YAML à la main.
- XP, badges, séries de jours, effets sonores et narration vocale (voix Piper pré-générées) optionnels, interface fr/en.
- Accessibilité visée : WCAG 2.2 AA (clavier complet, thèmes clair/sombre, taille de texte réglable).

> English version: [README-EN.md](README-EN.md)

## Démarrage rapide

Prérequis : Python 3.12+, Node.js 20+, `make`, `curl`.

```bash
make install     # outils de développement + Pyodide épinglé dans vendor/pyodide
make dev         # http://127.0.0.1:8000/
make test        # tests JS, tests Python, validation des niveaux
make build       # produit dist/ (application statique à servir en HTTPS)
```

`make help` liste toutes les cibles.

## Organisation

| Dossier | Contenu |
|---|---|
| `app/` | Application statique (JS ES modules, sans framework) |
| `levels/` | Niveaux (`level.yaml`), manifeste et schéma JSON |
| `scripts/` | Serveur de dev, validation des niveaux, build, téléchargement de Pyodide |
| `tests/` | Tests JS (`node:test`) et Python (`unittest`) |
| `nginx/` | Exemple de vhost avec les en-têtes COOP/COEP |
| `docs/design/` | Choix d'architecture et raisonnement |

## Déploiement

Le site doit être servi **en HTTPS**, à la racine d'un domaine, avec les en-têtes
`Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: require-corp`
(voir [nginx/pyquest.conf.example](nginx/pyquest.conf.example)). Ils permettent d'interrompre
proprement une boucle infinie. Sans eux, l'application fonctionne mais doit redémarrer son moteur
Python pour arrêter une cellule.

Pyodide est servi depuis le même domaine (jamais depuis un CDN) : c'est une contrainte de COEP.

### Sauvegarde et synchronisation (facultatives)

L'application est autonome : la progression est stockée dans le navigateur. Dans **Réglages**, on peut
l'exporter/importer en fichier JSON (sans serveur), ou la synchroniser entre appareils avec un jeton
secret (sans compte) si le backend Django est déployé sur le même domaine, derrière nginx
(`/api/` → Django, voir [nginx/pyquest.conf.example](nginx/pyquest.conf.example)). En développement :
`make dev-sync`. Fonctionnement détaillé : [docs/design/09-sync.md](docs/design/09-sync.md).

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md) (flux de contribution, ajout d'un niveau avec l'éditeur) et [docs/MAINTAINERS.md](docs/MAINTAINERS.md) (relecture, publication). `make ci` lance toute la chaîne de vérification.

## Licence

[MIT](LICENSE). Pyodide (MPL-2.0) et js-yaml (MIT) conservent leurs propres licences.
