# Écrire un niveau

Un niveau est un fichier **YAML** : `levels/NN-slug/level.yaml`. L'`id` doit être identique au nom du dossier
(`^[0-9]{2}-[a-z0-9-]+$`). Pas de code de l'application à toucher.

!!! tip "Le plus simple"
    L'[éditeur de niveaux](author-editor.md) remplit ce fichier pour toi, vérifie en direct et exécute tes
    solutions. Cette page décrit le format, pour comprendre ou finir à la main.

## Structure

```yaml
id: 05-decide
title:
    fr: Prendre des décisions
    en: Making decisions
difficulty: 3          # 0 à 10
xp: 70                 # accordés à la réussite de la mission
requires:
    - 04-math
steps:
    - type: explain
      voice: true      # bouton « Écouter » (narration pré-générée)
      text:
          fr: "Avec `if`, le programme choisit ce qu'il fait."
          en: "With `if`, the program chooses what to do."
    - type: code
      starter: |
          age = 15
          # Affiche « Majeur » si age vaut 18 ou plus
      instruction:
          fr: "Complète le programme."
          en: "Complete the program."
      tests:
          - kind: stdout_equals
            value: "Mineur\n"
      hints:
          fr: ["Utilise `if age >= 18:`.", "N'oublie pas `else:`."]
          en: ["Use `if age >= 18:`.", "Don't forget `else:`."]
      solution: |
          age = 15
          if age >= 18:
              print("Majeur")
          else:
              print("Mineur")
mission:
    title: {fr: Le portier, en: The doorman}
    goal: {fr: "…", en: "…"}
    starter: "…"
    tests: []
    solution: "…"
    reward_sound: success_big   # success_small | success_big | level_unlocked
```

Le schéma complet est `levels/schema/level.schema.json`. Modèle à copier : `levels/01-hello/level.yaml`.

## Règles pédagogiques

- **Une seule notion nouvelle** par étape, phrases courtes, ton encourageant, jamais culpabilisant.
- Alterne étapes `explain` et `code`.
- Chaque étape `code` : un `starter` qui s'exécute tel quel, une `instruction`, des `tests`, des `hints`
  (du plus vague au plus précis) et une `solution`.
- Une `mission` finale motivante, avec un `reward_sound`.
- **Français et anglais** pour chaque texte. Les identifiants du code Python restent en anglais.
- Les textes peuvent contenir du `code` entre accents graves.

## Solutions de référence

Chaque étape `code` et chaque mission avec tests doit avoir une `solution`. `make test` les exécute avec le vrai
Python : elle doit **passer** ses tests, et le code de départ ne doit **pas** les passer. Pour du code aléatoire,
teste la forme de la sortie (expression régulière) et l'usage d'une fonction (`code_contains`), pas une valeur
précise.

## Saisies scriptées (`inputs`)

Pour un programme qui appelle `input()`, ajoute `inputs` au test : le code est **rejoué** en isolation, chaque
`input()` recevant la valeur suivante de la liste. La validation est déterministe, quelle que soit la saisie
réelle de l'apprenant.

```yaml
tests:
    - kind: stdout_equals
      value: "Bonjour Ada\n"
      inputs: ["Ada"]
```

## Fichiers et dessin

- Les niveaux qui lisent ou écrivent des fichiers doivent utiliser le dossier **`data/`** (seul conservé entre les
  sessions).
- Les niveaux de dessin utilisent le module `canvas` (voir [Écrire et exécuter du code](../learn/code.md)) et les
  tests `drawing_*` ([Tests de validation](../reference/tests.md)).

## Ajouter le niveau et valider

1. Ajoute-le dans `levels/manifest.json` (ordre et `requires`).
2. `make validate-levels`, puis `make test` (vérifie toutes les solutions), puis `make voice` si des étapes ont
   `voice: true` (commite les mp3 générés dans `levels/<id>/audio/`).
3. Propose ta contribution : voir le [flux de contribution](flow.md).

## Sécurité

Un niveau ne contient **jamais de code exécuté par l'application**, hormis le code de départ et la solution
montrés à l'apprenant. Toute nouvelle sorte de validation est ajoutée au moteur, pas à un fichier de niveau.

## Accessibilité

Aucune information ne doit passer uniquement par la couleur ou le son. Une image décorative a un `alt` vide ; une
illustration porteuse de sens est décrite dans le texte.
