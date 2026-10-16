# Flux de contribution

Tu peux proposer un **niveau**, un **correctif** ou une **traduction**. Tu n'as pas besoin de connaître le
fonctionnement interne de l'application pour écrire un niveau.

## Étapes

1. **Branche** : une branche par contribution (`level-08-functions`, `fix-hint-typo`…). Un niveau par demande de
   fusion, c'est plus simple à relire.
2. **Prépare** : `make install` (outils et moteur Python), puis `make dev` pour essayer dans le navigateur
   (`http://127.0.0.1:8000/`).
3. **Écris** ton niveau, de préférence avec l'[éditeur de niveaux](author-editor.md), ou ton correctif.
4. **Vérifie** : `make ci` lance les tests, la vérification de **toutes les solutions de référence** avec le vrai
   Python, le typage et la construction du site. Avec Chromium installé : `make ci-e2e` ajoute les parcours dans
   un vrai navigateur.
5. **Commits** : messages en anglais, courts, à l'impératif (« Add level 08 functions »).
6. **Propose** ta contribution (pull request ou merge request) ; le modèle de description est dans
   `docs/ci/pull_request_template.md`.
7. **Relecture** par un mainteneur (voir `docs/MAINTAINERS.md` : pédagogie, ton, justesse, version anglaise,
   tests, accessibilité, sécurité), puis fusion.

En contribuant, tu acceptes que ta contribution soit publiée sous la licence du projet (MIT).

## Conventions

- Code, identifiants, noms de fichiers et messages de commit en **anglais** ; commentaires en **français**.
- Indentation de **4 espaces** partout (tabulations seulement pour `make`).
- JavaScript : classes ES2022 et modules natifs, pas de framework sans justification écrite.
- Python : typé, compatible `pyright` (`make typecheck`).
- Interface et contenus pédagogiques **bilingues fr/en**.
- Pas de dépendance à un service payant ou propriétaire.

## Commandes utiles

| Commande | Rôle |
|---|---|
| `make dev` | serveur de développement |
| `make dev-sync` | idem, avec le backend de synchronisation |
| `make validate-levels` | schéma, manifeste, traductions, code de départ qui compile |
| `make test` | tests JS, Python, backend, validation des niveaux, narration à jour |
| `make test-e2e` | parcours dans Chromium |
| `make voice` | génère la narration (Piper) |
| `make docs` | génère cette documentation |
| `make ci` / `make ci-e2e` | toute la chaîne de vérification |

## Narration vocale

Une étape `explain` avec `voice: true` a besoin de ses fichiers audio (`make voice`, qui télécharge les voix et
demande `ffmpeg`). `make ci` échoue s'ils manquent. Si tu ne peux pas les générer, mets `voice: false` : un
mainteneur activera la narration avant la fusion. Voix et licences : `levels/AUDIO-CREDITS.md`.
