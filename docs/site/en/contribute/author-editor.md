# The level editor

A built-in tool to write a level **without hand-writing YAML**, and without a server.

## Opening it

1. Run `make dev` (or open your instance).
2. In **Settings**, turn on **Author mode**.
3. Click **Open the level editor** (page `/author.html`).

Learners do not see this link while author mode is off.

!!! note "On a protected server"
    If the instance has the Django backend, opening `/author.html` requires signing in (an account authorised by an
    administrator in the Django administration, see [Deployment](../host/deploy.md)). Once signed
    in, the editor header shows your name and a **Sign out** button (the session lasts 8 hours). Locally (`make dev`) there
    is no login and no button.

## What it does

- **Forms** for the level information, steps (explanation or code exercise), tests, hints, solutions and the
  mission. Each text is entered in French **and** English, side by side.
- **Live checks**: schema conformity (targeted messages), missing translations, `requires`, missing solutions,
  inconsistent tests, invalid regular expressions, a reminder to generate the narration. A button jumps to the
  field concerned.
- **Run the exercises**: runs each solution with the browser's **real Python**, like `make test`. The solution
  must pass its tests and the starter code must not.
- **Try it**: plays the level as a learner, in the real interface (progress is never saved).
- **Export**: downloads `level.yaml` in the project's style, shows the line to add to the manifest and the next
  steps. You can also **import** a file or load an existing level to edit it.
- Your **draft** is saved in the browser.

## After exporting

1. Put `level.yaml` in `levels/NN-slug/` and add the manifest line.
2. `make validate-levels` and `make test`.
3. `make voice` for narrated steps.
4. Open your merge request ([contribution flow](flow.md)).

## Limits

- Narration cannot be generated in the browser: `make voice` is needed (the editor reminds you).
- Scripted inputs are entered one per line; an empty input in the middle is possible, not in last position.
- The editor helps but does not replace review: the `make` commands remain the reference.
