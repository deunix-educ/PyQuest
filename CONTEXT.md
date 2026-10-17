# Contexte de session — à lire en premier en reprenant ce projet

Dernière mise à jour : 2026-10-16. Dernier commit de travail : voir `git log`.

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
| Validation | `app/js/core/ValidationEngine.js` (kinds déclaratifs, dont `code_contains`), `StepValidator.js` (rejeux à `inputs`) ; `tests/js/level-solutions.integration.test.mjs` vérifie toutes les solutions de référence avec le vrai Pyodide |
| Erreurs | `app/js/core/ErrorTranslator.js` + `app/js/i18n/errors.{fr,en}.json` |
| Progression | `app/js/core/ProgressStore.js`, `KeyValueStores.js` (IndexedDB/mémoire), `SettingsStore.js` |
| Carte / badges | `app/js/ui/{ProgressMap,BadgeShelf,badgeArt}.js`, `app/css/progress.css` |
| Éditeur de niveaux | `app/author.html`, `app/js/author/*`, `app/css/author.css`, `app/js/i18n/author.*.json`, `app/js/core/{LevelLinter,LevelChecker}.js`, `app/js/lib/json-schema/` |
| Guide | `app/js/core/GuideEngine.js`, `app/js/i18n/guide.{fr,en}.json`, `app/js/ui/{GuideBubble,guideArt}.js`, `app/css/guide.css` |
| Audio / voix | `app/js/core/AudioEngine.js` (sons synthétisés), `VoiceEngine.js` (mp3 Piper + repli speechSynthesis), `speechKey.js` ; `scripts/generate_voice.py`, `voice_key.py` |
| UI | `app/js/ui/` (CellView, CellManager, NotebookView, HintPanel, ProgressMap, BadgeToast, SettingsPanel, dom.js), `app/js/i18n/{i18n.js,fr.json,en.json}`, `app/css/{themes,base,cells}.css`, `ui/CodeEditor.js`, `ui/highlightPython.js` |
| Shell PWA | `app/index.html`, `app/js/main.js`, `app/service-worker.js`, `app/manifest.webmanifest` |
| Tooling | `Makefile`, `scripts/{dev_server,validate_levels,build}.py`, `scripts/vendor_pyodide.sh` |
| Tests | `tests/js/*.test.mjs` (node:test), `tests/python/`, `backend/sync/tests.py`, `tests/e2e/` (Chromium) |
| Backend | `backend/` Django : `GET/PUT/DELETE /api/sync/` avec jeton Bearer (haché côté serveur), concurrence optimiste (`base` → 409) |
| Voix hors ligne | `core/OfflineVoices.js` (cache `pyquest-audio`, partagé avec le service worker : narration en cache-first, cache durable ; Pyodide aussi dans un cache versionné `pyquest-pyodide-<version>`), bouton dans les Réglages, préchargement du niveau ouvert ; e2e « voix hors ligne » |
| Pile locale | `make dev-nginx` (`scripts/local_stack.py`) : vrai nginx + Django, mêmes blocs que la prod (`nginx/pyquest-locations.conf.example`) ; `tests/e2e/nginx.test.mjs` ; binaire via `PYQUEST_NGINX` (ne pas utiliser `NGINX`, lue par nginx) |
| Accès éditeur | `backend/authors/` (login, `check` pour nginx `auth_request`, administration `/api/admin/` : groupe « Auteurs » / permission `use_editor`, `create_author`, anti force brute) ; nginx `pyquest.conf.example` ; prod = MariaDB |
| Synchronisation | `core/SyncClient.js` + section Réglages ; export/import fichier ; voir `docs/design/09-sync.md` ; `make dev-sync` |

## Déploiement sur le VPS — état et reprise (mis à jour 2026-10-17)

**État : rien n'est déployé.** Tout est préparé et testé sans serveur. **Flux retenu par l'utilisateur : il est root sur le
VPS (pas de sudo) et y clone le dépôt sous le nom `PyQuest`** (`git clone git@github.com:deunix-educ/PyQuest.git
/opt/PyQuest`, le remote `origin` est maintenant configuré), puis lance les scripts sur place ; plus de poussée depuis sa
machine (les anciens `deploy.sh`/`vps_bootstrap.sh` ont été supprimés). Décisions : site statique + backend Django
(synchronisation, accès authentifié à l'éditeur, administration), **MariaDB déjà en place**, nginx, Let's Encrypt, vhost
`nginx/pyquest.conf.example`. Noms système en minuscules (service/utilisateur `pyquest`, `/etc/pyquest`, `/var/www/pyquest`),
seul le dossier du dépôt est `PyQuest`.

**Inconnues à demander** : domaine, version de MariaDB et de nginx, e-mail Let's Encrypt, accès (clé de déploiement GitHub
sur le VPS ou HTTPS). Il exécute lui-même les commandes ; ne pas supposer d'accès SSH.

**Feuille de route** (détail et dépannage : `docs/site/fr/host/operations.md`), en root sur le VPS : `git clone` →
`./deploy/server_setup.sh --domain … --dry-run` puis `--certbot mail` → `./deploy/db_setup.sh` (base MariaDB + mot de
passe dans `/etc/pyquest/env`) → `systemctl enable --now pyquest` → `./scripts/server_manage.sh createsuperuser` →
`./scripts/server_update.sh` → `./scripts/vps_doctor.sh`.

| Outil (sur le VPS, en root, dans le clone) | Rôle | Testé |
|---|---|---|
| `deploy/server_setup.sh` | première installation idempotente (`--dry-run`) | arguments et dry-run seulement |
| `deploy/db_setup.sh` | base + utilisateur MariaDB, mot de passe généré dans `/etc/pyquest/env` (le mot de passe admin MariaDB est demandé) | faux `mariadb` |
| `scripts/server_update.sh` (`--rollback`, `--dry-run`, `--no-*`) | git pull --ff-only, build, publication atomique, pip, redémarrage, contrôle | dossiers temporaires (`tests/deploy/test_server_scripts.sh`) |
| `scripts/server_manage.sh` | `manage.py` de production (lit `/etc/pyquest/env` sans `source`) | faux Python |
| `scripts/vps_doctor.sh` | diagnostic en lecture seule (reconnaît l'installation intranet) | exécution locale |
| `deploy/install_vps.sh` | installateur VPS tout-en-un : contrôles, server_setup, MariaDB, service, admin, publication, cron | `--dry-run` + `tests/deploy/test_intranet.sh` |
| `deploy/install_intranet.sh` | installateur réseau interne (lycée) : autorité de certification interne (`scripts/intranet_cert.sh`), SQLite (`PYQUEST_DB_ENGINE=sqlite`), vhost `nginx/pyquest-intranet.conf.example`, page `/ca` (`deploy/intranet-ca.html`), cron certificat mensuel + sauvegarde | vrai openssl et vrai nginx (`tests/deploy/test_intranet.sh`) ; **jamais lancé sur un vrai serveur**. Décision utilisateur : postes partagés → un profil de navigateur (idéalement une session) par élève, voir docs host/installers |
| `scripts/backup_db.sh` | sauvegarde MariaDB vérifiée + rotation | faux `mariadb-dump` |
| `scripts/check_deploy.sh URL` | contrôle du site publié | serveur local et vrai nginx (`make dev-nginx`) |
| `deploy/pyquest.service.example`, `pyquest.env.example`, `mariadb-setup.sql.example` | unité systemd (migrate + collectstatic au démarrage), variables, base | syntaxe de l'unité |

**Jamais éprouvé en réel** : `server_setup.sh` sur un vrai serveur (apt, systemd, certbot), MariaDB, HTTPS réel, cookies
`Secure`. Premier réflexe en reprenant : `make ci`, puis `./scripts/vps_doctor.sh` sur le VPS, et lire les lignes ÉCHEC.

## Éditeur de niveaux (mode auteur) — fait le 2026-10-16

Décision de l'utilisateur : ouvrir à des contributeurs + éditeur en mode auteur (Django inchangé : sync
seulement). Voir `docs/design/08-author-editor.md`. Page `app/author.html`, code `app/js/author/`,
vérifications `core/LevelLinter.js` + `core/LevelChecker.js` (partagées avec `make test`), schéma validé
dans le navigateur par `lib/json-schema`. `scripts/validate_levels.py --file` valide un fichier seul.
Flux de contribution documenté (`CONTRIBUTING.md`, `docs/MAINTAINERS.md`, `docs/ci/*.example`, `make ci` / `make ci-e2e`).
**Reste** : audit accessibilité réel de l'éditeur (lecteur d'écran), éventuelle génération de narration côté CI.

## Décisions actées (ne pas redemander)

- Moteur Python : **Pyodide 314.0.7** (Python 3.14.2), épinglé + SHA-256 dans `vendor_pyodide.sh`.
- Hébergement VPS perso → COOP/COEP → `SharedArrayBuffer` pour l'interruption **et** pour `input()`.
  Pyodide vendorisé (jamais de CDN cross-origin) ; `vendor/pyodide/` gitignoré.
- Validation déclarative uniquement (enum fermé `tests[].kind`) ; champ optionnel `inputs` pour
  des saisies scriptées (rejeu isolé).
- `input()` **réel** (option b) : worker bloqué par `Atomics.wait`, champ de saisie dans la
  cellule, l'invite va dans stdout, pas la réponse. Sans isolation : `EOFError`.
- Effets sonores **synthétisés** (Web Audio) ; narration = mp3 **pré-générés** avec Piper (build).
- YAML lu côté navigateur par js-yaml 4.3.2 vendorisé.
- Tests JS : **`node:test`** sans dépendance ; e2e : `playwright-core` + Chromium système.
- Synchronisation : jeton aléatoire côté client, sans compte ; fusion côté client
  (`ProgressStore.import`, mode `merge`).
- Licence **MIT** (« PyQuest contributors ») — choisie par défaut, modifiable.
- **Fichiers dans Pyodide** : seul le dossier `data/` (monté sur IndexedDB via IDBFS dans le worker) survit
  au rechargement ; le reste du système de fichiers est en mémoire. Le niveau 10 l'enseigne. Les tests sous
  Node n'ont pas IndexedDB : `data/` y est un dossier mémoire (suffisant pour valider les solutions).
- Langue des commits/identifiants : anglais ; commentaires : français ; 4 espaces.

## À faire — priorités pour la prochaine session

1. **🔊 Son : traité le 2026-10-16, à valider à l'oreille par l'utilisateur.**
   - *Effets* : `AudioEngine` réécrit (synthèse additive en carillon, enveloppe exponentielle,
     gain maître + compresseur). Mesures automatiques (`tests/e2e/audio.test.mjs`) : crête
     −3 à −5 dBFS, niveau efficace ≈ −19 dBFS pour les 4 sons (≈ +13 dB de crête par rapport à
     l'ancien, estimé : l'ancien plafonnait à ≈ −18 dBFS). `AUDIO_DUMP_DIR=/tmp/fx make test-e2e`
     écrit les .wav pour les écouter. Bouton « Tester le son » dans les réglages.
   - *Voix* : narration **pré-générée avec Piper** (`make voice`) : mp3 mono 48 kbit/s normalisés
     à −18 LUFS, voix `fr_FR-siwis-medium` (CC BY 4.0) et `en_US-ljspeech-high` (domaine public),
     débit ×1,1 ; fichiers dans `levels/<id>/audio/<lang>/<clé>.mp3` (+ échantillon réglages dans
     `app/assets/voice/`). Clé = FNV-1a 64 du texte lu (`scripts/voice_key.py` ↔
     `app/js/core/speechKey.js`, vecteurs de test communs). `VoiceEngine` lit le fichier (via blob,
     compatible iOS) et se replie sur `speechSynthesis` s'il manque. Crédits/licences :
     `levels/AUDIO-CREDITS.md`. `make check-voice` (dans `make test`) détecte un fichier manquant.
   - **À faire** : l'utilisateur doit écouter effets et voix (la qualité perçue ne se mesure pas) ;
     ajuster gain/timbre (`NOTE_PEAK`, `BELL`, compresseur) ou voix/débit (`VOICES`, `LENGTH_SCALE`
     dans `scripts/generate_voice.py`) selon son retour. La voix est **activée par défaut**
     (le bouton « Écouter » ne lit jamais seul) ; le réglage « Voix » masque/affiche les boutons
     immédiatement. Piper = GPL-3.0 mais outil de build seulement.
   - Whisper (dictée) et pyannote (diarisation) : écartés (hors besoin ; pyannote = modèles à accès
     restreint). Whisper reste une option d'accessibilité lointaine (dicter une réponse à `input()`).
2. **Phase de design (décidée le 2026-10-16, après les niveaux 04-07)** — *amorcée le 2026-10-16* :
   navigation refaite (tiroir « Niveaux »/progression à gauche, tiroir « Réglages » à droite via
   `ui/Drawer.js`, en-tête avec niveau courant + précédent/suivant, lien direct `#/levels/<id>`,
   historique navigateur). **Étape 1 faite** : page de propositions `docs/design/identity/index.html` (3 palettes
   avec contrastes WCAG calculés, 3 typographies auto-hébergeables OFL, 3 mascottes + messages
   fr/en) ; **recommandation : palette B, typo 2, mascotte 1 (Chouette)** — **choix validé par l'utilisateur** (voir
   `docs/design/07-visual-identity.md`). **Étape 2 faite** : CSS découpé (`themes`/`base`/`cells`),
   palette B + typo 2 auto-hébergée, éditeur coloré (`CodeEditor`, `highlightPython`), icône
   chouette + PNG (`make icons`), test de contraste des thèmes. **Étape 3a faite** : personnage-guide (chouette, 4 humeurs, messages variés fr/en,
   `GuideEngine`, réglage pour le masquer). **Étape 3b faite** : carte de progression graphique (chemin sinueux, chouette sur le
   niveau en cours), badges illustrés (médailles obtenues/à débloquer + notification), feedback coloré
   déjà doublé de texte. **La phase de design est terminée** (reste de l'ancienne liste : voir 3+). Anciennes notes : **Reste** : identité visuelle
   (palette, typo, logo), découpage CSS (`base`/`themes`/`cells`), coloration syntaxique de
   l'éditeur, carte de progression graphique, personnage-guide aux messages variés fr/en,
   badges illustrés, feedback coloré (vert/rouge, toujours doublé d'un texte). Procéder en 3
   temps avec validation à chaque étape (propositions → CSS/éditeur → carte + personnage).
3. ~~Niveaux 08 à 14~~ **tous faits** (00 à 14), solutions vérifiées par `make test`, narration générée. Les niveaux 13
   (classes, `Pencil`) et 14 (projet : motifs sauvegardés dans `data/`) reposent sur le module Python `canvas`
   (`canvas.line`, `canvas.clear`, défini dans `pyquest_runner.py`), affiché par `ui/DrawingView.js` et validé par les
   kinds `drawing_*` (`core/drawingTests.js`). Choix : chaque exécution repart d'une feuille vierge (relancer ne
   superpose pas), repère centré y vers le haut (-200..200), 7 couleurs nommées, valeurs de test en chaînes (éditables
   dans l'éditeur auteur). Pas de galerie de motifs : le niveau 14 sauvegarde et recharge via `data/`.
   `LevelChecker` repart d'un état vierge (variables + `data/`) à chaque essai.
3. **Navigateurs** : validé dans Chromium 155 ; Firefox testé par l'utilisateur (OK, 2026-10-16). Reste Safari desktop et surtout
   **iOS Safari** (mémoire WASM, autoplay audio, `SharedArrayBuffer` + `Atomics.wait`).
4. Icônes PNG (iOS) en plus de `app/icons/icon.svg`.
5. ~~Client de synchronisation~~ fait (export/import fichier + sync complète, e2e avec vrai Django). Reste : QR code du jeton (dépendance), URL serveur configurable (CORS).
6. ~~Documentation MkDocs bilingue~~ faite : `mkdocs.yml`, sources `docs/site/{fr,en}/` (mêmes pages, `make docs` strict, dans `make ci`, aucune ressource externe) ; à tenir à jour avec les fonctionnalités. Reste : compilation des traductions Django
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
make test                          # JS + Python + backend + niveaux + narration à jour
make voice                         # (re)génère la narration (venv .venv-voice, ffmpeg requis)
make test-e2e                      # parcours Chromium (CHROMIUM=/usr/bin/chromium par défaut)
make typecheck                     # pyright (backend inclus)
make dev                           # http://127.0.0.1:8000/
```

Contrôle d'un son/UI à la main : `make dev` puis ouvrir l'URL dans un navigateur.

## Pièges rencontrés (à ne pas redécouvrir)

- **Service worker et code périmé** (bug réel, 2026-10-16) : le SW servait le JS « cache d'abord »
  avec un nom de cache constant → en dev, le navigateur gardait l'ancien code (l'utilisateur ne
  voyait ni la nouvelle voix ni les correctifs). Désormais : réseau d'abord pour tout sauf
  `/vendor/pyodide/`. En cas de doute chez un utilisateur : DevTools → Application → Service
  Workers → Unregister + Clear site data, ou recharger deux fois. Bumper `CACHE_VERSION` purge
  l'ancien cache à l'activation.
- **Interruption perdue au démarrage** (test flaky sous charge) : le worker remet le tampon
  d'interruption à 0 au début de chaque cellule ; une interruption envoyée avant ce début est
  effacée. Les tests renvoient l'interruption en boucle (comme un utilisateur qui reclique) et les
  tests longs ont un `timeout` pour qu'un blocage échoue au lieu de pendre `make test`.
- **`pause` avant `ended`** (bug réel, 2026-10-16) : les navigateurs émettent `pause` juste avant
  `ended` ; traiter `pause` comme une interruption faisait afficher « Impossible de lire la voix »
  alors que la lecture réussissait. Le test e2e vérifie désormais l'absence de ce message.
- **Lecture audio et activation utilisateur** : `play()` après un `await fetch` peut être refusé
  (Safari/iOS surtout). `VoiceEngine` « amorce » l'élément audio avec un silence dans le clic, puis
  change la source. Les tests e2e tournent sans option d'autoplay pour rester réalistes.

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
- Après tout ajout/modification d'un texte `explain` avec `voice: true` : `make voice` puis commit des mp3.
- Aide aux tests de niveaux : un test `inputs` ne peut qu'affirmer (pas de négation) → utiliser des
  regex ancrées (`^[^\\n]*Mot\\n$`) ; l'invite de `input()` est dans stdout, sans retour à la ligne.
- Ne pas lancer de `pkill -f` large : il peut tuer le shell de l'outil.

## Git

Branche `master`, historique de commits par composant. Aucun remote configuré. L'utilisateur a
autorisé les commits « quand nécessaire » (messages en anglais, trailer Co-Authored-By).
