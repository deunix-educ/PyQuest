# Contribution flow

You can propose a **level**, a **fix** or a **translation**. You do not need to know how the app works inside to
write a level.

## Steps

1. **Branch**: one branch per contribution (`level-08-functions`, `fix-hint-typo`…). One level per merge request is
   easier to review.
2. **Prepare**: `make install` (tools and Python engine), then `make dev` to try it in the browser
   (`http://127.0.0.1:8000/`).
3. **Write** your level, preferably with the [level editor](author-editor.md), or your fix.
4. **Check**: `make ci` runs the tests, the check of **all reference solutions** with real Python, type checking
   and the build. With Chromium installed, `make ci-e2e` adds the real-browser journeys.
5. **Commits**: messages in English, short, imperative ("Add level 08 functions").
6. **Propose** your contribution (pull request or merge request); the description template is in
   `docs/ci/pull_request_template.md`.
7. **Review** by a maintainer (see `docs/MAINTAINERS.md`: pedagogy, tone, correctness, English version, tests,
   accessibility, security), then merge.

By contributing you agree that your contribution is published under the project licence (MIT).

## Conventions

- Code, identifiers, file names and commit messages in **English**; comments in **French**.
- **4-space** indentation everywhere (tabs only for `make`).
- JavaScript: ES2022 classes and native modules, no framework without a written justification.
- Python: typed, `pyright`-clean (`make typecheck`).
- UI and teaching content **bilingual fr/en**.
- No dependency on a paid or proprietary service.

## Useful commands

| Command | Purpose |
|---|---|
| `make dev` | development server |
| `make dev-sync` | same, with the sync backend |
| `make validate-levels` | schema, manifest, translations, starter code compiles |
| `make test` | JS, Python, backend tests, level validation, narration up to date |
| `make test-e2e` | journeys in Chromium |
| `make voice` | generate the narration (Piper) |
| `make docs` | build this documentation |
| `make ci` / `make ci-e2e` | the whole verification chain |

## Voice narration

An `explain` step with `voice: true` needs its audio files (`make voice`, which downloads the voices and requires
`ffmpeg`). `make ci` fails if they are missing. If you cannot generate them, set `voice: false`: a maintainer will
enable narration before merging. Voices and licences: `levels/AUDIO-CREDITS.md`.
