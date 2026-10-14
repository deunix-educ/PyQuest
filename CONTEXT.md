# Contexte de session — à lire en premier en reprenant ce projet

Dernière mise à jour : 2026-10-14.

## Où on en est

Le brief original est [`prompt-pyquest.md`](prompt-pyquest.md) (résumé fidèle dans
`docs/design/00-brief-summary.md`). Il demande 8 livrables dans l'ordre. Progression :

| # | Livrable | État |
|---|---|---|
| 1 | Analyse comparative moteurs Python-navigateur + choix motivé | ✅ Fait — `docs/design/01-pyodide-choice.md` |
| 2 | Schéma d'architecture (Mermaid) | ✅ Fait — `docs/design/02-architecture-diagram.md` |
| 3 | Arborescence complète du projet | ✅ Fait — `docs/design/03-project-tree.md` |
| 4 | Spécification du format de niveau (JSON Schema + exemple) | ✅ Schéma fait (`levels/schema/level.schema.json`) — **exemple complet de niveau encore à écrire** |
| 5 | Parcours pédagogique (tableau des niveaux) | ✅ Fait — `docs/design/05-curriculum.md` |
| 6 | Stratégie anti-abandon | ✅ Fait — `docs/design/06-anti-dropout.md` |
| 7 | Code du socle + 3 premiers niveaux | ✅ Fait (sauf test en vrai navigateur) |
| 8 | Outillage (Makefile, README fr/en, CONTRIBUTING, etc.) | ✅ Fait (MkDocs bilingue pas encore écrit) |

## Décisions actées pendant la discussion (ne pas redemander)

- Moteur Python : **Pyodide** (pas Brython/Skulpt/MicroPython-WASM).
- Hébergement : **VPS perso** → en-têtes `COOP`/`COEP` activables → interrupt buffer
  `SharedArrayBuffer` comme méthode principale d'arrêt des boucles infinies.
- Conséquence : Pyodide **vendorisé** (servi en local, pas de CDN cross-origin), polices web aussi
  self-hostées si besoin.
- `vendor/pyodide/` → **gitignored**, régénéré par `make vendor-pyodide`.
- Backend Django de sync multi-appareils : **oui**, optionnel, jamais requis.
- `tests[].kind` du schéma de niveau : enum fermé (pas de DSL extensible) — choix délibéré pour la
  sécurité (pas de code arbitraire injectable via un fichier de niveau).
- Outil de test JS : **pas encore choisi** (Vitest ou web-test-runner), à trancher au moment d'écrire
  `tests/js/`.

## Reste à faire

1. **Tester dans un vrai navigateur** (`make dev`) : aucun test n'a encore tourné dans Chrome/Firefox/
   Safari. Le worker, le client et Pyodide sont validés ensemble sous Node
   (`tests/js/pyodide-worker.integration.test.mjs`), mais pas l'UI réelle, le service worker, ni
   IndexedDB. Prévoir un test sur iOS Safari (mémoire WASM, autoplay audio).
2. Icônes PNG (iOS) en plus de `app/icons/icon.svg`.
3. Branchement du client de synchronisation (jeton Bearer + `ProgressStore.export/import`) :
   le backend (`backend/sync`) existe, pas encore le côté client ni l'UI.
4. Documentation MkDocs bilingue (`docs/mkdocs/`).
5. Niveaux 03 à 14 (voir `docs/design/05-curriculum.md`). `input()` doit d'abord être tranché :
   actuellement `EOFError` (pas de saisie synchrone dans le worker).
6. Audit accessibilité réel (lecteur d'écran, axe) et compilation des traductions Django
   (`compilemessages`, gettext absent sur le poste actuel).
7. Kinds de test non encore définis : `stdout_contains_any_name`, `function_called_with`.

## Pour reprendre sur un autre poste

1. Copier/cloner tout le dossier `PyQuest/` (`prompt-pyquest.md` + ce fichier + `CLAUDE.md` +
   `docs/design/` + `levels/schema/` suffisent à reconstituer tout le contexte, même sans
   historique de conversation).
2. Le dépôt est un repo git (branche `master`, premier commit `83c3c24` « Initial design
   scaffold for PyQuest »). Aucun remote configuré à ce jour.
3. Relire `CLAUDE.md` puis ce fichier, puis directement attaquer le point 7 ci-dessus — aucune
   des décisions d'architecture n'a besoin d'être rediscutée.

## Git

Dépôt initialisé, branche `master`, un commit initial. Pour pousser/tirer entre postes, il reste
à ajouter un remote (dépôt perso, VPS, ou plateforme externe au choix). Les commits ne sont faits
que sur demande explicite.
