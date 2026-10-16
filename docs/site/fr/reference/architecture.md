# Architecture

## Vue d'ensemble

```text
┌──────────────────────────── Navigateur ────────────────────────────┐
│  Interface (modules ES) ──► Client du worker ◄──► Web Worker       │
│        │                                          Pyodide/CPython  │
│        ▼                                               │           │
│  IndexedDB : progression, réglages            data/ persistant     │
└────────┬───────────────────────────────────────────────────────────┘
         │ lit                                  (facultatif)
         ▼                                           ▼
  levels/*.yaml + schéma JSON               Backend Django /api/sync/
```

L'application est **autonome** : tout s'exécute dans le navigateur. Le backend n'est qu'un stockage optionnel de la
progression.

## Choix structurants

- **Moteur Python : Pyodide** (CPython réel en WebAssembly) : fidélité des messages d'erreur, bibliothèque standard
  complète. Il tourne dans un **Web Worker** pour ne jamais figer l'interface.
- **Interruption** par un `SharedArrayBuffer` (signal SIGINT de Python) : demande un site isolé
  (COOP/COEP), d'où un Pyodide servi par le même domaine. La saisie `input()` utilise aussi un
  `SharedArrayBuffer`.
- **Niveaux déclaratifs** : YAML validé par JSON Schema ; la validation d'un exercice passe par une liste **fermée**
  de types de tests, jamais par du code venant du niveau.
- **JavaScript** : classes ES2022 et modules natifs, sans framework.
- **Fichiers** : seul `data/` est monté sur IndexedDB (IDBFS) et survit aux sessions.
- **Dessin** : le module `canvas` enregistre des traits renvoyés avec le résultat de l'exécution ; l'interface les
  affiche et les tests `drawing_*` les examinent.
- **Narration** : mp3 générés à l'avance (Piper, outil de build uniquement), repli sur la voix du système.

## Où est quoi

| Dossier | Contenu |
|---|---|
| `app/` | application (HTML, CSS, `js/core`, `js/ui`, `js/author`, `js/workers`, `python/`) |
| `levels/` | niveaux, manifeste, schéma, narration |
| `backend/` | API de synchronisation Django |
| `scripts/` | serveur de dev, validation, build, voix |
| `tests/` | `js/` (node:test), `python/`, `e2e/` (Chromium) |
| `docs/site/` | cette documentation ; `docs/design/` : notes de conception (en français) |

Le raisonnement détaillé de chaque choix est dans `docs/design/` du dépôt.
