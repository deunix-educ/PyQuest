# Architecture

## Overview

```text
┌───────────────────────────── Browser ──────────────────────────────┐
│  Interface (ES modules) ──► Worker client ◄──► Web Worker          │
│        │                                       Pyodide / CPython   │
│        ▼                                            │              │
│  IndexedDB: progress, settings              persistent data/       │
└────────┬───────────────────────────────────────────────────────────┘
         │ reads                                (optional)
         ▼                                           ▼
  levels/*.yaml + JSON schema                Django backend /api/sync/
```

The application is **self-contained**: everything runs in the browser. The backend is only an optional store for
progress.

## Key decisions

- **Python engine: Pyodide** (real CPython in WebAssembly): faithful error messages, complete standard library. It
  runs in a **Web Worker** so the interface never freezes.
- **Interruption** through a `SharedArrayBuffer` (Python's SIGINT): needs an isolated site (COOP/COEP), hence a
  Pyodide served from the same domain. `input()` also uses a `SharedArrayBuffer`.
- **Declarative levels**: YAML validated by JSON Schema; validating an exercise goes through a **closed** list of
  test types, never through code coming from the level.
- **JavaScript**: ES2022 classes and native modules, no framework.
- **Files**: only `data/` is mounted on IndexedDB (IDBFS) and survives sessions.
- **Drawing**: the `canvas` module records lines returned with the run result; the interface displays them and the
  `drawing_*` tests examine them.
- **Narration**: pre-generated mp3 files (Piper, build tool only), falling back to the system voice.

## What lives where

| Folder | Content |
|---|---|
| `app/` | the application (HTML, CSS, `js/core`, `js/ui`, `js/author`, `js/workers`, `python/`) |
| `levels/` | levels, manifest, schema, narration |
| `backend/` | Django sync API |
| `scripts/` | dev server, validation, build, voices |
| `tests/` | `js/` (node:test), `python/`, `e2e/` (Chromium) |
| `docs/site/` | this documentation; `docs/design/`: design notes (in French) |

The detailed reasoning behind each choice is in the repository's `docs/design/`.
