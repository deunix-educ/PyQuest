# Tests de validation

La liste des types de tests (`tests[].kind`) est **fermée** : ajouter un type passe par le moteur.

| `kind` | Champs | Réussit si… |
|---|---|---|
| `no_syntax_error` | — | le code ne contient pas d'erreur de syntaxe |
| `stdout_equals` | `value` | la sortie est **exactement** égale (retour à la ligne final compris) |
| `stdout_contains` | `value` | la sortie contient ce texte |
| `stdout_matches_regex` | `value` | la sortie complète correspond à l'expression régulière |
| `var_equals` | `name`, `value` | la variable vaut `value` (`10.0` est un `float`, `10` un `int`) |
| `var_type_is` | `name`, `value` | la variable a ce type (`str`, `int`, `float`, `list`…) |
| `code_contains` | `value` | le code de l'apprenant contient ce texte (ex. `random.choice`) |
| `drawing_segments` | `value` | le dessin a ce nombre de traits : `"4"` (exactement) ou `"4+"` (au moins) |
| `drawing_has_line` | `value` | un trait relie deux points : `"0,0 100,0"` ou avec couleur `"0,0 100,0 red"` |
| `drawing_colors` | `value` | toutes ces couleurs sont utilisées : `"red,blue"` |

Champs communs : `message` (texte `fr`/`en` affiché si le test échoue) et `inputs` (saisies scriptées, voir
[Écrire un niveau](../contribute/write-level.md)).

## Détails

- **Sortie** : l'invite de `input()` est dans la sortie (comme en Python), pas la réponse.
- **`code_contains`** ne s'évalue pas sur un rejeu : inutile avec `inputs`.
- **Dessin** : un trait compte comme présent si ses extrémités sont à moins de 0,5 de celles demandées, **dans un
  sens ou dans l'autre**. Couleurs : `black`, `red`, `green`, `blue`, `orange`, `purple`, `gray`. Le dessin vient de
  l'exécution de la cellule (une feuille vierge à chaque exécution).
- **Une erreur d'exécution** fait toujours échouer l'étape.

## Ajouter un type de test

1. `ValidationEngine` : interpréter le type (et `supportedKinds`).
2. `levels/schema/level.schema.json` : l'ajouter à l'énumération.
3. `app/js/author/LevelDraft.js` : l'ajouter à `TEST_KINDS`.
4. Catalogues de l'éditeur : `author.kind.<type>` et son aide ; messages `reason.*` de l'application.
5. `LevelLinter` si des règles de cohérence s'imposent, puis des tests unitaires.
