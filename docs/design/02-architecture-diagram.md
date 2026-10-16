# Schéma d'architecture

```mermaid
flowchart TB
    subgraph MainThread["Thread principal (UI)"]
        UI[NotebookView<br/>CellManager / CellView]
        LE[LessonEngine<br/>charge manifest.json + level.yaml]
        VE[ValidationEngine<br/>interprète tests déclaratifs]
        PS[ProgressStore<br/>XP, badges, streaks]
        AE[AudioEngine<br/>Web Audio API]
        VO[VoiceEngine<br/>speechSynthesis]
        PWC[PyodideWorkerClient<br/>protocole postMessage]
    end

    subgraph Worker["Web Worker — Moteur Python"]
        PY[Pyodide / CPython WASM<br/>stdout/stderr redirigés]
        IB[Interrupt buffer<br/>SharedArrayBuffer]
    end

    subgraph Storage["Stockage local"]
        IDB[(IndexedDB<br/>progression, réglages)]
    end

    subgraph SW["Service Worker"]
        CACHE[(Cache API<br/>app shell + Pyodide vendorisé<br/>+ fichiers de niveaux)]
    end

    subgraph Backend["Backend optionnel (Django, même VPS)"]
        API[API REST<br/>sync multi-appareils]
        DB[(MariaDB/SQLite)]
    end

    UI -->|clic Exécuter| PWC
    PWC -->|postMessage: run_code, interrupt| PY
    PY <-->|contrôle d'exécution| IB
    PY -->|postMessage: stdout, result, error| PWC
    PWC --> VE
    VE -->|résultat du test| UI
    VE -->|XP/badge gagné| PS
    PS <-->|lecture/écriture| IDB
    PS -.->|son/voix de récompense| AE
    PS -.-> VO
    LE -->|fetch levels/*.yaml| UI
    UI -->|requêtes réseau statiques| SW
    SW -->|réponses mises en cache| UI
    PS -.->|si connecté, sync optionnelle| API
    API <--> DB

    classDef optional stroke-dasharray: 5 5
    class Backend,API,DB optional
```

## Points notables

- **`PyodideWorkerClient` ↔ Worker** est la seule frontière qui parle à Python : aucun code
  utilisateur ne s'exécute jamais sur le thread principal (isolation + UI jamais bloquée).
- **`ValidationEngine`** vit côté thread principal, pas dans le worker : il reçoit stdout/valeurs
  de variables déjà extraites par Pyodide et les compare aux `tests` déclarés dans le niveau — ça
  garde le moteur de validation agnostique du contenu (plug-in sans toucher au code).
- Le **Backend Django** est en pointillé dans le diagramme d'origine (optionnel), mais est
  maintenant confirmé comme faisant partie du périmètre du projet — branché uniquement sur
  `ProgressStore`, jamais une dépendance du parcours d'apprentissage.
