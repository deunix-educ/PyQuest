# PyQuest

Learn Python by doing, **right in the browser**: nothing to install, works offline (PWA), for
beginners and advanced learners alike.

- Real Python (CPython compiled to WebAssembly through [Pyodide](https://pyodide.org)) running in
  a Web Worker: genuine error messages, translated into plain language.
- Notebook-style cells, progressive hints, automatic exercise validation.
- Declarative levels (YAML): adding a level requires no code change.
- Built-in level editor (author mode) to contribute without hand-writing YAML.
- XP, badges, daily streaks, optional sound effects and narration (pre-generated Piper voices), French/English interface.
- Accessibility target: WCAG 2.2 AA (full keyboard use, light/dark themes, adjustable text size).

> Version française : [README.md](README.md)

## Quick start

Requirements: Python 3.12+, Node.js 20+, `make`, `curl`.

```bash
make install     # dev tools + pinned Pyodide in vendor/pyodide
make dev         # http://127.0.0.1:8000/
make test        # JS tests, Python tests, level validation
make build       # produces dist/ (static app to serve over HTTPS)
```

`make help` lists every target.

## Layout

| Folder | Content |
|---|---|
| `app/` | Static application (ES modules JS, no framework) |
| `levels/` | Levels (`level.yaml`), manifest and JSON Schema |
| `scripts/` | Dev server, level validation, build, Pyodide download |
| `tests/` | JS (`node:test`) and Python (`unittest`) tests |
| `nginx/` | Example vhost with the COOP/COEP headers |
| `docs/design/` | Architecture decisions and rationale (in French) |

## Deployment

The site must be served **over HTTPS**, at the root of a domain, with the headers
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
(see [nginx/pyquest.conf.example](nginx/pyquest.conf.example)). They allow an infinite loop to be
interrupted cleanly. Without them the app still works but must restart its Python engine to stop
a cell.

Pyodide is served from the same domain (never from a CDN): this is a COEP requirement.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), in particular to add a level.

## License

[MIT](LICENSE). Pyodide (MPL-2.0) and js-yaml (MIT) keep their own licenses.
