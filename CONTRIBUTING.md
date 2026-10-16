# Contribuer à PyQuest / Contributing to PyQuest

Français d'abord, English below.

## Conventions

- Code, identifiants, noms de fichiers et messages de commit en **anglais** ; commentaires en
  **français**.
- Indentation de **4 espaces** partout (sauf les tabulations imposées par `make`).
- JavaScript : classes ES2022 et modules ES natifs, pas de framework sans justification écrite.
- Python : typé, compatible `pyright` (`make typecheck`).
- Interface et contenus pédagogiques **bilingues fr/en** (fr par défaut).
- `make test` doit passer avant toute demande de fusion (inclut la vérification de toutes les
  solutions de référence des niveaux).

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
| `code_contains` | `value` | le code de l'apprenant contient cette chaîne (ex. `random.choice`, `while`) |

Tout test accepte un champ optionnel `inputs` (liste de chaînes). Pour un code qui appelle
`input()`, le test est alors évalué sur un **rejeu** du code (sur une copie de l'état) où chaque
`input()` reçoit la valeur suivante de la liste : la validation est déterministe, quelle que soit
la saisie réelle de l'apprenant. Les tests sans `inputs` portent sur l'exécution de l'apprenant.
L'invite de `input()` est écrite dans la sortie standard (comme en Python), pas la réponse.

Un niveau ne contient **jamais de code exécutable** autre que le code de départ et la solution
affichés à l'apprenant : toute nouvelle sorte de validation passe par le moteur
(`app/js/core/ValidationEngine.js`), pas par un fichier de niveau.

### Solutions de référence

Chaque étape `code` et chaque mission avec tests doit avoir une `solution`. `make test` exécute
(avec le vrai Pyodide) toutes les solutions : elles doivent passer leurs tests, et le code de
départ ne doit **pas** les passer (sauf pour une étape « exécute pour voir », où départ et
solution ne diffèrent que par des commentaires). Pour du code aléatoire, testez la forme de la
sortie (regex) et l'usage de la fonction (`code_contains`), pas une valeur précise.

### Narration vocale

Une étape `explain` avec `voice: true` propose un bouton « Écouter ». La narration est un fichier
mp3 **pré-généré** avec Piper : après avoir ajouté ou modifié un texte narré, lancez `make voice`
(télécharge les voix au premier lancement, nécessite `ffmpeg`) et commitez les fichiers
`levels/<id>/audio/`. `make check-voice` (inclus dans `make test`) échoue si un fichier manque ou est
périmé. Sans fichier, l'application se rabat sur la voix du système. Voix et licences :
[levels/AUDIO-CREDITS.md](levels/AUDIO-CREDITS.md).

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
5. Run `make validate-levels`; for narrated steps (`voice: true`) run `make voice` and commit the generated `audio/` files (see `levels/AUDIO-CREDITS.md`).

Levels never contain executable code other than the starter and solution shown to the learner:
new kinds of validation are added to the engine, not to level files.
