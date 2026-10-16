# Éditeur de niveaux (mode auteur)

Décidé le 2026-10-16 : ouvrir le projet à des contributeurs avec un outil convivial pour composer les
niveaux, **sans serveur** (le backend Django reste réservé à la synchronisation de la progression).

## Accès

Page statique `app/author.html` (`/author.html`). Le réglage « Mode auteur » de l'application affiche
un lien vers elle ; elle n'est jamais proposée aux apprenants autrement.

## Ce qu'il fait

- **Formulaires** pour les informations du niveau, les étapes (explication / exercice de code), les
  tests déclaratifs (kind, valeur, saisies scriptées, message), les indices, les solutions et la
  mission. Chaque texte est saisi en français **et** en anglais, côte à côte.
- **Vérifications en direct** (`core/LevelLinter.js`) : conformité au schéma (messages ciblés, pas de
  cascade), traductions `en`, `requires`, solutions présentes, cohérence des tests, expressions
  régulières, rappels (narration à générer). Même esprit que `scripts/validate_levels.py`.
- **Exécution avec le vrai Python** (`core/LevelChecker.js`, bouton « Exécuter les exercices ») : la
  solution de chaque exercice passe ses tests, le code de départ ne les passe pas. Même module que
  `make test`.
- **Essai comme apprenant** : le niveau joué dans la vraie interface (`CellManager`), progression en
  mémoire (jamais enregistrée).
- **Export** : `level.yaml` au style du projet (4 espaces, `- clé:` compacté), ligne à ajouter au
  manifeste, étapes à suivre (`make validate-levels`, `make voice`, `make test`). Import d'un fichier ou
  chargement d'un niveau existant pour le modifier. Brouillon enregistré dans le navigateur (IndexedDB).

## Organisation du code

| Module | Rôle |
|---|---|
| `author/LevelDraft.js` | modèle de formulaire ⇄ niveau du schéma (`toLevel` / `fromLevel`), YAML |
| `author/{fields,TestEditor,StepEditor,LevelForm}.js` | formulaires accessibles (labels, `data-path`, fieldsets) |
| `author/ProblemsPanel.js` | affichage des vérifications, bouton « aller au champ » |
| `author/AuthorApp.js` | orchestration (brouillon, vérifications, essai, export) |
| `core/LevelLinter.js`, `core/LevelChecker.js` | vérifications statiques et d'exécution (partagées avec les tests) |
| `lib/json-schema/` | `@cfworker/json-schema` 4.1.1 (MIT) vendorisé, sans `eval` |
| `i18n/author.{fr,en}.json` | textes de l'éditeur + messages `lint.<code>` |

## Garde-fous (tests)

- `level-draft.test.mjs` : `toLevel(fromLevel(niveau))` redonne **exactement** chaque niveau existant,
  le YAML exporté se recharge à l'identique et est accepté par `scripts/validate_levels.py`.
- `level-linter.test.mjs` : aucun problème bloquant sur les vrais niveaux ; chaque défaut fabriqué est
  détecté, au bon chemin.
- `level-solutions.integration.test.mjs` : `LevelChecker` sur les vrais niveaux et sur des niveaux fautifs.
- `author-i18n.test.mjs` : toutes les clés utilisées existent en fr et en, un message par code de problème.
- e2e : écrire un niveau de A à Z dans le navigateur, le vérifier, l'essayer, télécharger un fichier valide.

## Ajouter un kind de test (évolution du moteur)

1. `ValidationEngine` : interpréter le kind (+ `supportedKinds`) ; 2. `levels/schema/level.schema.json` :
l'ajouter à l'enum ; 3. `author/LevelDraft.js` : l'ajouter à `TEST_KINDS` ; 4. catalogues : `author.kind.<kind>`
et `.help` ; 5. `core/LevelLinter.js` si des règles de cohérence s'imposent ; 6. tests unitaires.

## Limites connues

- La narration (Piper) ne se génère pas dans le navigateur : l'auteur la fait générer avec `make voice`
  avant la fusion (le linter le rappelle).
- Les saisies scriptées sont une par ligne : une saisie vide au milieu est possible, pas en dernière position.
- Un niveau n'est pas publié par l'éditeur : il produit un fichier à proposer par pull request.
