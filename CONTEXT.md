# Contexte de session — à lire en premier en reprenant ce projet

Dernière mise à jour : 2026-10-14 (fin de session). Dernier commit de travail : voir `git log`.

## Où on en est

Le brief original est [`prompt-pyquest.md`](prompt-pyquest.md) (résumé fidèle dans
`docs/design/00-brief-summary.md`). Les 8 livrables du brief sont écrits ; le socle tourne dans un
vrai navigateur (Chromium) avec 4 niveaux jouables.

| # | Livrable | État |
|---|---|---|
| 1 | Analyse comparative moteurs Python-navigateur + choix motivé | ✅ `docs/design/01-pyodide-choice.md` |
| 2 | Schéma d'architecture (Mermaid) | ✅ `docs/design/02-architecture-diagram.md` |
| 3 | Arborescence complète du projet | ✅ `docs/design/03-project-tree.md` |
| 4 | Format de niveau (JSON Schema + exemples) | ✅ `levels/schema/level.schema.json`, `docs/design/04-level-format.md`, niveaux 00-03 |
| 5 | Parcours pédagogique | ✅ `docs/design/05-curriculum.md` |
| 6 | Stratégie anti-abandon | ✅ `docs/design/06-anti-dropout.md` |
| 7 | Code du socle + premiers niveaux | ✅ `app/` (voir « Architecture du code ») ; niveaux 00, 01, 02, 03 |
| 8 | Outillage | ✅ Makefile, scripts, README fr/en, CONTRIBUTING, LICENSE (MIT), nginx, backend Django |

## Architecture du code (où est quoi)

| Zone | Fichiers |
|---|---|
| Moteur Python | `app/js/workers/python-worker.js` (Pyodide, stdout, interruption, input), `app/python/pyquest_runner.py` (exécution de cellule, JSON de résultat, namespace persistant, exécution isolée) |
| Client du worker | `app/js/core/PyodideWorkerClient.js` (run/interrupt/reset, buffers partagés, repli `terminate()`) |
| Niveaux | `app/js/core/LessonEngine.js`, `LevelSession.js`, `app/js/lib/js-yaml/` (vendorisé, dossier `lib/` car `vendor/` est gitignoré) |
| Validation | `app/js/core/ValidationEngine.js` (kinds déclaratifs), rejeux à `inputs` dans `app/js/ui/CellManager.js` |
| Erreurs | `app/js/core/ErrorTranslator.js` + `app/js/i18n/errors.{fr,en}.json` |
| Progression | `app/js/core/ProgressStore.js`, `KeyValueStores.js` (IndexedDB/mémoire), `SettingsStore.js` |
| Audio / voix | `app/js/core/AudioEngine.js` (sons synthétisés), `VoiceEngine.js` (speechSynthesis) |
| UI | `app/js/ui/` (CellView, CellManager, NotebookView, HintPanel, ProgressMap, BadgeToast, SettingsPanel, dom.js), `app/js/i18n/{i18n.js,fr.json,en.json}`, `app/css/app.css` |
| Shell PWA | `app/index.html`, `app/js/main.js`, `app/service-worker.js`, `app/manifest.webmanifest` |
| Tooling | `Makefile`, `scripts/{dev_server,validate_levels,build}.py`, `scripts/vendor_pyodide.sh` |
| Tests | `tests/js/*.test.mjs` (node:test), `tests/python/`, `backend/sync/tests.py`, `tests/e2e/` (Chromium) |
| Backend | `backend/` Django : `GET/PUT /api/sync/` avec jeton Bearer (haché côté serveur) |

## Décisions actées (ne pas redemander)

- Moteur Python : **Pyodide 314.0.7** (Python 3.14.2), épinglé + SHA-256 dans `vendor_pyodide.sh`.
- Hébergement VPS perso → COOP/COEP → `SharedArrayBuffer` pour l'interruption **et** pour `input()`.
  Pyodide vendorisé (jamais de CDN cross-origin) ; `vendor/pyodide/` gitignoré.
- Validation déclarative uniquement (enum fermé `tests[].kind`) ; champ optionnel `inputs` pour
  des saisies scriptées (rejeu isolé).
- `input()` **réel** (option b) : worker bloqué par `Atomics.wait`, champ de saisie dans la
  cellule, l'invite va dans stdout, pas la réponse. Sans isolation : `EOFError`.
- Sons **synthétisés** (Web Audio), pas de fichiers mp3.
- YAML lu côté navigateur par js-yaml 4.3.2 vendorisé.
- Tests JS : **`node:test`** sans dépendance ; e2e : `playwright-core` + Chromium système.
- Synchronisation : jeton aléatoire côté client, sans compte ; fusion côté client
  (`ProgressStore.import`, mode `merge`).
- Licence **MIT** (« PyQuest contributors ») — choisie par défaut, modifiable.
- Langue des commits/identifiants : anglais ; commentaires : français ; 4 espaces.

## À faire — priorités pour la prochaine session

1. **🔊 Améliorer le son (retour utilisateur : « inaudible et de mauvaise qualité »).**
   Constat : `AudioEngine` synthétise les sons (oscillateurs). Pistes à traiter, à *écouter sur
   un vrai appareil* (impossible à valider en test automatique) :
   - niveau trop bas : crête = `BASE_GAIN (0.15) × volume (0.8) ≈ 0.12`, notes de 0,1–0,5 s ;
     monter nettement le gain, ajouter un `GainNode` maître + `DynamicsCompressorNode` ;
   - timbre : `square`/`sawtooth` agressifs et pauvres ; préférer sinus/triangle + harmoniques,
     enveloppe ADSR avec `exponentialRampToValueAtTime`, éventuellement filtre passe-bas ;
   - vérifier que le contexte est bien `running` au moment du `play()` (déblocage `unlock()` au
     premier clic ; contrôler iOS) et que le volume des réglages (0–1) est appliqué ;
   - alternative : échantillons audio courts libres de droits (CC0) vendorisés dans
     `app/assets/sounds/` (compatible licence, cache service worker à prévoir) ;
   - ajouter un bouton « tester le son » dans `SettingsPanel` pour régler/valider rapidement.
2. **Niveaux 04 à 14** (tableau dans `docs/design/05-curriculum.md`). Méthode : écrire le YAML
   (fr + en obligatoires), `make validate-levels`, ajouter au manifeste, parcours e2e. Prochain :
   **04 Calculer** (opérateurs, `%`, priorités ; mission convertisseur d'unités).
3. **Navigateurs** : validé dans Chromium 155 seulement. Reste Firefox, Safari desktop et surtout
   **iOS Safari** (mémoire WASM, autoplay audio, `SharedArrayBuffer` + `Atomics.wait`).
4. Icônes PNG (iOS) en plus de `app/icons/icon.svg`.
5. Client de synchronisation (jeton + export/import) et son UI ; le backend existe.
6. Documentation MkDocs bilingue (`docs/mkdocs/`) ; compilation des traductions Django
   (`compilemessages`, gettext absent du poste actuel).
7. Audit accessibilité réel (lecteur d'écran, axe) ; le champ de saisie `input()` en particulier.
8. Kinds de test pas encore définis : `stdout_contains_any_name`, `function_called_with`.
9. Liste de pré-cache du service worker : générée par `make build` seulement (en dev elle est
   courte et manuelle).
10. Remote git à configurer si besoin de synchroniser entre postes.

## Reprendre le travail

```bash
git log --oneline | head          # où on en est
make install                       # venv .venv + Pyodide (déjà vendorisé = no-op)
make test                          # JS + Python + backend + validation des niveaux
make test-e2e                      # parcours Chromium (CHROMIUM=/usr/bin/chromium par défaut)
make typecheck                     # pyright (backend inclus)
make dev                           # http://127.0.0.1:8000/
```

Contrôle d'un son/UI à la main : `make dev` puis ouvrir l'URL dans un navigateur.

## Pièges rencontrés (à ne pas redécouvrir)

- Node lit un `.js` sans `package.json` en CommonJS : pour tester un fichier avec classes à champs
  privés, passer par une copie `.mjs` ou importer depuis un test `.mjs` (les imports ESM
  fonctionnent via détection de syntaxe, mais `node --check fichier.js` échoue).
- `node --test` exige un glob : `node --test tests/js/*.test.mjs` (pas le dossier).
- Un test Python qui appelle `input()` réel bloque sur stdin : toujours lancer avec `< /dev/null`
  et ne jamais exécuter `input()` sans pont.
- `TextEncoder.encodeInto` refuse une vue sur `SharedArrayBuffer` dans les navigateurs (pas dans
  Node) : encoder en local puis recopier. Même précaution côté `TextDecoder` (copie `.slice`).
- `.gitignore` contient `vendor/` : tout dossier nommé `vendor` est ignoré (d'où `app/js/lib/`).
- Les tests e2e ciblent le bouton Exécuter par `.cell-run` (la classe `.btn-primary` est partagée
  avec le bouton « Envoyer » de la saisie).
- Messages d'erreur Python : validés sur Python 3.14.2 (Pyodide) ; à recontrôler si la version
  de Pyodide change (`tests/js/error-translator.test.mjs` utilise le `python3` du poste).
- Ne pas lancer de `pkill -f` large : il peut tuer le shell de l'outil.

## Git

Branche `master`, historique de commits par composant. Aucun remote configuré. L'utilisateur a
autorisé les commits « quand nécessaire » (messages en anglais, trailer Co-Authored-By).
