# Writing a level

A level is a **YAML** file: `levels/NN-slug/level.yaml`. The `id` must equal the folder name
(`^[0-9]{2}-[a-z0-9-]+$`). No application code to touch.

!!! tip "The easy way"
    The [level editor](author-editor.md) fills this file for you, checks live and runs your solutions. This page
    describes the format, to understand it or finish by hand.

## Structure

```yaml
id: 05-decide
title:
    fr: Prendre des décisions
    en: Making decisions
difficulty: 3          # 0 to 10
xp: 70                 # granted when the mission is completed
requires:
    - 04-math
steps:
    - type: explain
      voice: true      # "Listen" button (pre-generated narration)
      text:
          fr: "Avec `if`, le programme choisit ce qu'il fait."
          en: "With `if`, the program chooses what to do."
    - type: code
      starter: |
          age = 15
          # Show "Majeur" if age is 18 or more
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

The full schema is `levels/schema/level.schema.json`. A model to copy: `levels/01-hello/level.yaml`.

## Teaching rules

- **One new notion** per step, short sentences, encouraging tone, never guilt-inducing.
- Alternate `explain` and `code` steps.
- Each `code` step: a `starter` that runs as is, an `instruction`, `tests`, `hints` (from vaguest to most precise)
  and a `solution`.
- A motivating final `mission`, with a `reward_sound`.
- **French and English** for every text. Python identifiers in the code stay in English.
- Texts may contain `code` between backticks.

## Reference solutions

Every `code` step and every mission with tests must have a `solution`. `make test` runs them with real Python: it
must **pass** its tests, and the starter code must **not** pass them. For random code, test the shape of the output
(regular expression) and the use of a function (`code_contains`), not a precise value.

## Scripted inputs (`inputs`)

For a program that calls `input()`, add `inputs` to the test: the code is **replayed** in isolation, each `input()`
receiving the next value in the list. Validation is deterministic, whatever the learner actually typed.

```yaml
tests:
    - kind: stdout_equals
      value: "Bonjour Ada\n"
      inputs: ["Ada"]
```

## Files and drawing

- Levels that read or write files must use the **`data/`** folder (the only one kept between sessions).
- Drawing levels use the `canvas` module (see [Writing and running code](../learn/code.md)) and the `drawing_*`
  tests ([Validation tests](../reference/tests.md)).

## Add the level and validate

1. Add it to `levels/manifest.json` (order and `requires`).
2. `make validate-levels`, then `make test` (checks all solutions), then `make voice` if steps have `voice: true`
   (commit the generated mp3 files in `levels/<id>/audio/`).
3. Propose your contribution: see the [contribution flow](flow.md).

## Security

A level **never contains code run by the application**, apart from the starter and solution shown to the learner.
Any new kind of validation is added to the engine, not to a level file.

## Accessibility

No information may be conveyed by colour or sound alone. A decorative image has an empty `alt`; a meaningful
illustration is described in the text.
