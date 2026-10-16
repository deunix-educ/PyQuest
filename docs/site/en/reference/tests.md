# Validation tests

The list of test types (`tests[].kind`) is **closed**: adding a type goes through the engine.

| `kind` | Fields | Passes if… |
|---|---|---|
| `no_syntax_error` | — | the code has no syntax error |
| `stdout_equals` | `value` | the output is **exactly** equal (final newline included) |
| `stdout_contains` | `value` | the output contains this text |
| `stdout_matches_regex` | `value` | the whole output matches the regular expression |
| `var_equals` | `name`, `value` | the variable equals `value` (`10.0` is a `float`, `10` an `int`) |
| `var_type_is` | `name`, `value` | the variable has this type (`str`, `int`, `float`, `list`…) |
| `code_contains` | `value` | the learner's code contains this text (e.g. `random.choice`) |
| `drawing_segments` | `value` | the drawing has this number of lines: `"4"` (exactly) or `"4+"` (at least) |
| `drawing_has_line` | `value` | a line joins two points: `"0,0 100,0"` or with a colour `"0,0 100,0 red"` |
| `drawing_colors` | `value` | all these colours are used: `"red,blue"` |

Common fields: `message` (`fr`/`en` text shown when the test fails) and `inputs` (scripted inputs, see
[Writing a level](../contribute/write-level.md)).

## Details

- **Output**: the `input()` prompt is in the output (as in Python), not the answer.
- **`code_contains`** is not evaluated on a replay: useless with `inputs`.
- **Drawing**: a line counts as present if its ends are within 0.5 of the requested ones, **in either direction**.
  Colours: `black`, `red`, `green`, `blue`, `orange`, `purple`, `gray`. The drawing comes from the cell's run (a
  blank sheet at each run).
- **A runtime error** always fails the step.

## Adding a test type

1. `ValidationEngine`: interpret the type (and `supportedKinds`).
2. `levels/schema/level.schema.json`: add it to the enumeration.
3. `app/js/author/LevelDraft.js`: add it to `TEST_KINDS`.
4. Editor catalogues: `author.kind.<type>` and its help; the application's `reason.*` messages.
5. `LevelLinter` if consistency rules are needed, then unit tests.
