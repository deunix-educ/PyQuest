# Identité visuelle (décidée le 2026-10-16)

Choix de l'utilisateur parmi les propositions de [`identity/index.html`](identity/index.html)
(rapports de contraste calculés, polices et dessins comparés) :

| Élément | Choix | Mise en œuvre |
|---|---|---|
| Palette | **B — Forêt & Corail** (vert-bleu profond, accent corail pour XP et focus) | `app/css/themes.css` (jetons clair/sombre, y compris couleurs de coloration syntaxique) |
| Typographie | **2 — Atkinson Hyperlegible + JetBrains Mono** | `app/assets/fonts/` (woff2 latin, licences OFL), `@font-face` dans `themes.css`, ligatures désactivées dans le code |
| Mascotte | **1 — Chouette** | icône de l'application (`app/icons/icon.svg`, PNG 180/192/512 via `make icons`) ; personnage-guide à intégrer à l'étape 3 |

## Organisation du CSS

- `themes.css` : polices, jetons de couleur (clair, sombre, automatique), taille de texte.
- `base.css` : page, boutons, en-tête, notebook, tiroirs, toasts, progression, réglages.
- `cells.css` : cellules, éditeur coloré, sortie, retours de validation, indices, saisie `input()`.

## Garde-fous

- `tests/js/theme-contrast.test.mjs` lit `themes.css` et vérifie les rapports de contraste WCAG
  (texte ≥ 4,5 : 1, composants et focus ≥ 3 : 1, couleurs de coloration incluses), thèmes clair et sombre.
- La coloration syntaxique (`app/js/ui/highlightPython.js`, `CodeEditor.js`) est décorative :
  le contrôle reste un `<textarea>` réel, le calque coloré est `aria-hidden`.
