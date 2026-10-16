# PyQuest — mémo projet pour Claude Code

## Quoi
Plateforme web (PWA) d'apprentissage de Python par la pratique, pour public débutant à avancé.
Python s'exécute **dans le navigateur** via Pyodide (WebAssembly), dans un Web Worker. Console à
cellules façon Jupyter simplifiée. Niveaux déclaratifs (YAML/JSON + Markdown) validés par JSON
Schema, chargeables en plug-in sans toucher au code de l'app. Gamification (XP, badges, streaks),
audio/voix optionnels, accessibilité WCAG 2.2 AA, bilingue fr/en (fr par défaut).

Le brief complet est dans [`prompt-pyquest.md`](prompt-pyquest.md) à la racine. Son contenu est
aussi résumé dans `docs/design/00-brief-summary.md`.

**État de la conception et prochaine action à faire** : voir [CONTEXT.md](CONTEXT.md) — toujours le
lire en premier en reprenant une session sur ce projet.

## Décisions d'architecture figées (ne pas rouvrir sans raison forte)

- **Moteur Python : Pyodide** (CPython réel compilé en WASM), pas Brython/Skulpt/MicroPython-WASM.
  Raison : fidélité des messages d'erreur réels (exigence pédagogique explicite) + stdlib complète
  pour les niveaux avancés. Détail et compromis : `docs/design/01-pyodide-choice.md`.
- **Hébergement : VPS perso** → on maîtrise nginx, donc on active `COOP: same-origin` +
  `COEP: require-corp` pour utiliser l'**interrupt buffer `SharedArrayBuffer`** de Pyodide comme
  méthode principale de coupure des boucles infinies (pas de fallback `worker.terminate()` en
  mécanisme principal). Conséquence directe : **Pyodide doit être vendorisé** (servi depuis le
  même domaine), jamais chargé depuis un CDN cross-origin — sinon COEP le bloque. Idem pour toute
  police web non-système.
- **`vendor/pyodide/` est gitignored**, régénéré par `make vendor-pyodide` (script à écrire dans
  `scripts/vendor_pyodide.sh`).
- **Backend Django = oui**, mais strictement optionnel et jamais requis pour apprendre : sert
  uniquement à la synchronisation multi-appareils de la progression. Settings séparés dev/prod,
  traductions fr/en, doc MkDocs bilingue.
- Validation des exercices : déclarative uniquement (`tests[].kind` en enum fermé dans le schéma de
  niveau) — jamais de code arbitraire exécuté depuis un fichier de niveau, pour garder l'isolation
  de sécurité.

## Conventions de code (imposées par l'utilisateur, non négociables)

- Code toujours en **anglais** (identifiants, fichiers, messages de commit) ; **commentaires en
  français**.
- Indentation **4 espaces** partout (Python, JS, HTML, CSS, YAML, JSON), sauf tabulations imposées
  par `make`.
- JavaScript en **classes ES2022**, modules ES natifs, pas de framework lourd sans justification
  écrite.
- Python typé, compatible **pyright** (`pyrightconfig.json` à la racine).
- Interface et contenus pédagogiques **bilingues fr/en**, fichiers de traduction séparés, fr par
  défaut.
- `README.md` (fr) **et** `README-EN.md` (en) obligatoires.
- `Makefile` couvrant : install, dev server, validation des niveaux contre le schéma, build prod,
  tests, clean.
- `.gitattributes` + `.gitignore` strict (aucun secret : clés, `.env`, mails perso, certificats,
  bases locales).
- Licence open source + `CONTRIBUTING.md` expliquant comment contribuer un niveau.
- Accessibilité : clavier complet, contrastes suffisants, mode sombre/clair, taille de police
  réglable, son/voix toujours désactivables, aucune info transmise uniquement par le son/la couleur.
- Pas de dépendance à un service payant ou propriétaire. Ne jamais inventer une API navigateur
  incertaine sans le signaler et prévoir un repli.

## Repères dans le dépôt

- `docs/design/` — tout le raisonnement et les choix déjà actés (lire avant de coder quoi que ce
  soit, pour ne pas re-discuter ce qui est tranché).
- `levels/schema/level.schema.json` — schéma JSON Schema validé du format de niveau (déjà écrit).
- Arborescence cible complète du projet : `docs/design/03-project-tree.md`.

## État d'avancement

Livrables 1 à 8 du brief écrits ; l'app tourne dans Chromium (4 niveaux : 00 à 03). Détail,
architecture du code, priorités et pièges : [CONTEXT.md](CONTEXT.md).

Commandes : `make test` (JS `node:test`, Python `unittest`, backend Django, validation des
niveaux), `make test-e2e` (Chromium), `make typecheck` (pyright), `make dev`, `make build`.
Pyodide épinglé 314.0.7 (Python 3.14.2) via `make vendor-pyodide`.

**À traiter en premier à la reprise** : recueillir le retour d'écoute de l'utilisateur sur les
nouveaux effets sonores et la voix Piper (retour initial : « inaudible et de mauvaise qualité »),
ajuster si besoin (voir CONTEXT.md) ; puis niveaux 04 et suivants.

## Règles de travail apprises

- Chaque niveau ajouté : `fr` **et** `en`, `make validate-levels`, `make voice` si des étapes ont
  `voice: true` (commiter les mp3), entrée dans `levels/manifest.json`, parcours e2e si le niveau introduit un comportement nouveau.
- Tester dans un vrai navigateur dès qu'un comportement dépend d'API navigateur : des écarts
  Node/Chromium (ex. `encodeInto` sur `SharedArrayBuffer`) ne se voient qu'ainsi.
- Les commits sont autorisés « quand nécessaire » : un commit par composant cohérent, message en
  anglais, avec le trailer Co-Authored-By.
- Ne jamais exécuter de code venant d'un fichier de niveau côté application : tout passe par les
  `tests[].kind` du moteur.
