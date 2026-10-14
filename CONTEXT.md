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
| 7 | Code du socle + 3 premiers niveaux | ❌ **Pas commencé — prochaine action** |
| 8 | Outillage (Makefile, README fr/en, CONTRIBUTING, etc.) | ❌ Pas commencé |

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

## Prochaine action concrète (point 7 du brief)

Écrire, dans cet ordre (chaque composant doit rester petit et testable isolément) :

1. ✅ FAIT — `levels/manifest.json` + `levels/00-intro/level.yaml`, `levels/01-hello/level.yaml`,
   `levels/02-variables/level.yaml` — contenu conforme à `levels/schema/level.schema.json`, en
   suivant le tableau de `docs/design/05-curriculum.md` pour les notions/missions exactes.
2. ✅ FAIT (non testé dans un navigateur : Pyodide pas encore vendorisé) — `app/js/workers/python-worker.js` + `app/python/pyquest_runner.py` — charge Pyodide vendorisé, redirige stdout/stderr, expose un
   protocole `postMessage` (`run_code`, `interrupt`, résultats), utilise l'interrupt buffer
   `SharedArrayBuffer`.
3. ✅ FAIT (testé avec un Worker simulé) — `app/js/core/PyodideWorkerClient.js` — wrapper côté thread principal du protocole ci-dessus.
4. ✅ FAIT — `app/js/core/LessonEngine.js` + `LevelSession.js` + `app/js/lib/js-yaml` — charge `manifest.json` + `level.yaml`, expose les steps.
5. ✅ FAIT — `app/js/core/ValidationEngine.js` — interprète les `tests[].kind` du schéma (stdout_equals,
   var_equals, etc.) de façon agnostique au contenu.
6. ✅ FAIT — `app/js/core/ErrorTranslator.js` + `app/js/i18n/errors.{fr,en}.json` — traduit les tracebacks Python en messages simples fr/en
   (cf. ton de l'exemple 2 du brief).
7. `app/js/core/ProgressStore.js` — IndexedDB (XP, badges, streaks, niveaux complétés) + export/import.
8. `app/js/core/AudioEngine.js` + `app/js/core/VoiceEngine.js` — effets sonores et
   `speechSynthesis`, déblocage uniquement sur geste utilisateur (contrainte iOS autoplay).
9. `app/js/ui/*` — `NotebookView`, `CellManager`, `CellView`, `HintPanel`, `ProgressMap`,
   `BadgeToast`, `SettingsPanel`.
10. `app/index.html`, `app/manifest.webmanifest`, `app/service-worker.js` — app shell PWA,
    cache des assets Pyodide vendorisés + des fichiers de niveaux pour le hors-ligne.

Puis point 8 : `Makefile`, `pyrightconfig.json`, `README.md`/`README-EN.md`,
`CONTRIBUTING.md`, `.gitattributes`/`.gitignore`, `nginx/pyquest.conf.example` (en-têtes COOP/COEP
déjà spécifiés dans `docs/design/01-pyodide-choice.md`), squelette `backend/` Django.

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
