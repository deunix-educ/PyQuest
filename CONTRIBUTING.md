# Contribuer à PyQuest / Contributing to PyQuest

Français d'abord, English below.

## Conventions

- Code, identifiants, noms de fichiers et messages de commit en **anglais** ; commentaires en
  **français**.
- Indentation de **4 espaces** partout (sauf les tabulations imposées par `make`).
- JavaScript : classes ES2022 et modules ES natifs, pas de framework sans justification écrite.
- Python : typé, compatible `pyright` (`make typecheck`).
- Interface et contenus pédagogiques **bilingues fr/en** (fr par défaut).
- `make test` doit passer avant toute demande de fusion.

## Ajouter un niveau

1. **Créer le dossier** `levels/NN-slug/` (ex. `levels/03-input/`) avec un fichier `level.yaml`.
   L'`id` doit être identique au nom du dossier (`^[0-9]{2}-[a-z0-9-]+$`).
2. **Écrire le contenu** en suivant le schéma [`levels/schema/level.schema.json`](levels/schema/level.schema.json).
   Prenez `levels/01-hello/level.yaml` comme modèle :
    - une seule notion nouvelle par étape, phrases courtes, ton encourageant ;
    - alternez étapes `explain` et `code` ;
    - chaque étape `code` : un `starter` exécutable tel quel, une `instruction`, des `tests`,
      idéalement des `hints` (du plus vague au plus précis) et une `solution` ;
    - une `mission` finale motivante, avec `reward_sound`.
3. **Fournir le français et l'anglais** pour chaque texte (`fr` et `en`).
4. **Référencer le niveau** dans `levels/manifest.json` (ordre et `requires`).
5. **Valider** : `make validate-levels` vérifie le schéma, le manifeste, la présence des
   traductions `en` et que le code de départ compile.

### Tests déclaratifs disponibles

| `kind` | Champs | Sens |
|---|---|---|
| `no_syntax_error` | — | pas d'erreur de syntaxe |
| `stdout_equals` | `value` | sortie exactement égale (retour à la ligne final inclus) |
| `stdout_contains` | `value` | sous-chaîne présente dans la sortie |
| `stdout_matches_regex` | `value` | la sortie complète correspond à l'expression régulière |
| `var_equals` | `name`, `value` | variable égale à la valeur |
| `var_type_is` | `name`, `value` | type de la variable (`str`, `int`, `float`…) |

Un niveau ne contient **jamais de code exécutable** autre que le code de départ et la solution
affichés à l'apprenant : toute nouvelle sorte de validation passe par le moteur
(`app/js/core/ValidationEngine.js`), pas par un fichier de niveau.

### Accessibilité

Aucune information ne doit passer uniquement par la couleur ou le son. Les images décoratives
ont un `alt` vide ; une illustration porteuse de sens doit être décrite dans le texte.

---

## English

- Code, identifiers, file names and commit messages in **English**; comments in **French**.
- **4-space** indentation everywhere (except tabs required by `make`).
- JavaScript: ES2022 classes and native ES modules, no framework without a written justification.
- Python: typed, `pyright`-clean (`make typecheck`).
- UI and teaching content are **bilingual fr/en**.
- `make test` must pass before a merge request.

### Adding a level

1. Create `levels/NN-slug/level.yaml`; the `id` must equal the folder name.
2. Follow [`levels/schema/level.schema.json`](levels/schema/level.schema.json) and use
   `levels/01-hello/level.yaml` as a model (one new notion per step, short sentences, encouraging
   tone, runnable `starter`, `tests`, graduated `hints`, `solution`, motivating `mission`).
3. Provide both `fr` and `en` for every text.
4. List the level in `levels/manifest.json`.
5. Run `make validate-levels`.

Levels never contain executable code other than the starter and solution shown to the learner:
new kinds of validation are added to the engine, not to level files.
