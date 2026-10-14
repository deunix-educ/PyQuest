# Format de niveau — notes de conception

Schéma complet et à jour : [`levels/schema/level.schema.json`](../../levels/schema/level.schema.json).

Exemples complets conformes au schéma : `levels/00-intro`, `levels/01-hello`,
`levels/02-variables` (validés avec `jsonschema`).

## Forme des tests (`tests[]`) utilisée par les niveaux

Le schéma laisse `additionalProperties: true` ; les champs ci-dessous sont la convention que le
`ValidationEngine` doit interpréter :

| `kind` | Champs | Sens |
|---|---|---|
| `no_syntax_error` | — | le code s'exécute sans `SyntaxError` |
| `stdout_equals` | `value` (str) | sortie standard exactement égale (retour à la ligne final inclus) |
| `stdout_contains` | `value` (str) | sous-chaîne présente dans la sortie |
| `stdout_matches_regex` | `value` (regex) | la sortie complète correspond à la regex |
| `var_equals` | `name`, `value` | variable globale égale à la valeur (`10.0` = float, `10` = int) |
| `var_type_is` | `name`, `value` (`str`/`int`/`float`…) | type de la variable |

`stdout_contains_any_name` et `function_called_with` : forme à fixer quand un niveau en aura
besoin. Un niveau sans test de mission (ex. `00-intro`) se valide par un simple bouton dans l'UI.

## Organisation des fichiers

- Un dossier par niveau : `levels/<id>/level.yaml` (+ `.md` optionnel si les textes `explain`
  deviennent longs — pas nécessaire tant que les textes restent courts, cf. contrainte « phrases
  courtes » du brief).
- `levels/manifest.json` fixe l'ordre d'affichage et les dépendances (`requires: ["00-intro"]`).

## Points de conception actés

- **`tests[].kind` en enum fermé** (pas de DSL extensible) : force tout nouveau type de validation
  à passer par une évolution du moteur, pas du contenu — garantit qu'aucun fichier de niveau ne
  peut injecter du code arbitraire. Cohérent avec la contrainte de sécurité du brief (« exécution
  isolée du code utilisateur »). Choix délibéré ; à revoir uniquement si un besoin de validation
  non anticipé apparaît souvent.
- **`en` non `required`** dans `i18nString` : permet de contribuer un niveau en français seul. Le
  `CONTRIBUTING.md` (à écrire, point 8) devra exiger `en` avant merge via une étape de CI, sans
  que ça bloque la validation JSON Schema elle-même.
- **Validation CLI** : `scripts/validate_levels.py` (à écrire, point 7/8) doit valider chaque
  `level.yaml` contre ce schéma — cible Makefile `make validate-levels`.
