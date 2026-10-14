# Arborescence cible du projet

```
PyQuest/
├── app/                              # Application statique (PWA, JS vanilla ES modules)
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   ├── css/
│   │   ├── base.css
│   │   ├── themes.css                # mode sombre/clair, tailles de police
│   │   └── cells.css
│   ├── js/
│   │   ├── main.js                   # point d'entrée, bootstrap de l'app
│   │   ├── core/
│   │   │   ├── EventBus.js
│   │   │   ├── PyodideWorkerClient.js
│   │   │   ├── LessonEngine.js
│   │   │   ├── ValidationEngine.js
│   │   │   ├── ErrorTranslator.js    # traduction des tracebacks Python → messages simples
│   │   │   ├── ProgressStore.js      # wrapper IndexedDB + export/import JSON
│   │   │   ├── AudioEngine.js
│   │   │   └── VoiceEngine.js
│   │   ├── ui/
│   │   │   ├── CellView.js
│   │   │   ├── CellManager.js
│   │   │   ├── NotebookView.js
│   │   │   ├── HintPanel.js
│   │   │   ├── ProgressMap.js
│   │   │   ├── BadgeToast.js
│   │   │   └── SettingsPanel.js
│   │   ├── workers/
│   │   │   └── python-worker.js      # exécuté comme Worker, charge Pyodide vendorisé
│   │   └── i18n/
│   │       ├── i18n.js
│   │       ├── fr.json
│   │       └── en.json
│   └── assets/
│       ├── sounds/                   # (inutilisé : AudioEngine synthétise les sons via Web Audio, pas de mp3)
│       └── icons/                    # icônes PWA (plusieurs résolutions)
│
├── vendor/
│   └── pyodide/                      # assets Pyodide vendorisés (make vendor-pyodide), gitignored
│
├── levels/
│   ├── manifest.json                 # ordre des niveaux + dépendances (requires)
│   ├── schema/
│   │   └── level.schema.json
│   ├── 00-intro/level.yaml
│   ├── 01-hello/level.yaml
│   └── 02-variables/level.yaml       # etc., un dossier par niveau
│
├── scripts/
│   ├── validate_levels.py            # valide chaque level.yaml contre le schema
│   ├── vendor_pyodide.sh             # télécharge/épingle la version de Pyodide
│   └── build.py                      # bundling minimal pour la prod
│
├── backend/                          # Django — sync multi-appareils uniquement, optionnel pour l'apprenant
│   ├── manage.py
│   ├── pyquest_api/
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── dev.py
│   │   │   └── production.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── sync/
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── migrations/
│   ├── locale/
│   │   ├── fr/LC_MESSAGES/
│   │   └── en/LC_MESSAGES/
│   └── requirements.txt
│
├── docs/
│   ├── design/                       # ce dossier — raisonnement et décisions de conception
│   └── mkdocs/                       # doc MkDocs bilingue (utilisateur final / API backend)
│       ├── mkdocs.yml
│       ├── fr/
│       └── en/
│
├── tests/
│   ├── js/                           # tests du moteur JS (LessonEngine, ValidationEngine...)
│   └── python/                       # tests backend Django
│
├── nginx/
│   └── pyquest.conf.example          # vhost avec en-têtes COOP/COEP (cf. 01-pyodide-choice.md)
│
├── pyrightconfig.json
├── Makefile
├── README.md
├── README-EN.md
├── CONTRIBUTING.md
├── LICENSE
├── .gitattributes
└── .gitignore
```

## Décisions actées sur cette arborescence

- `vendor/pyodide/` : **gitignored**, régénéré par `make vendor-pyodide`.
- `backend/` et `docs/mkdocs/` : confirmés dans le périmètre (backend Django de sync = oui).
- Outil de test JS pour `tests/js/` : pas encore choisi (Vitest ou web-test-runner), à trancher au
  moment d'écrire les premiers tests.
