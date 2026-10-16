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

## Personnage-guide (la chouette)

- **Messages** : `app/js/i18n/guide.{fr,en}.json`, plusieurs variantes par situation (accueil, retour
  après pause, réussite du premier coup / après essais, erreur Python, test non validé, suggestion
  d'indice, indice révélé, boucle interrompue, saisie attendue, niveau terminé, révision, série de
  jours). Ton : bienveillant, jamais culpabilisant, « une erreur, c'est un indice ».
- **Variété** : `GuideEngine` tire sans remise (toutes les variantes avant qu'une se répète, jamais
  la même deux fois de suite).
- **Humeurs du dessin** : neutre, content, réfléchi (erreurs), fête (réussites) — `ui/guideArt.js`,
  couleurs par jetons du thème (`css/guide.css`).
- **Placement** : la bulle apparaît là où l'attention est déjà (sous le retour de validation de la
  cellule, et dans le fil du notebook à l'accueil et en fin de niveau). Décorative pour les lecteurs
  d'écran (avatar `aria-hidden`, le retour de validation reste la source d'information).
- **Réglage** « Personnage-guide » : masque toutes les bulles (`data-guide="off"` sur `<html>`).
- Ajouter une situation : clé dans les deux catalogues + humeur dans `GuideEngine` ; le test
  `tests/js/guide-engine.test.mjs` vérifie parité fr/en, variantes distinctes et paramètres connus.

## Carte de progression et badges

- **Carte** (`ui/ProgressMap.js`, `css/progress.css`) : chemin sinueux de pastilles reliées dans le
  tiroir « Ta progression ». Segment plein = niveau terminé, pointillé = à venir. La chouette se tient
  près du niveau en cours. Chaque niveau est un bouton dont le nom accessible contient « Niveau n »,
  le titre et l'état en texte ; la pastille montre ✔ ou le numéro : le sens ne repose jamais sur la
  couleur seule. Aucun verrou. Le tiroir défile jusqu'au niveau en cours à l'ouverture.
- **Badges** (`ui/BadgeShelf.js`, `ui/badgeArt.js`) : médailles illustrées (pousse, escalier, étoile,
  flamme, grande flamme). Obtenu = coloré, avec la date ; à débloquer = silhouette grise en pointillés
  avec la condition en texte. La même médaille s'affiche dans la notification d'obtention.
- Ajouter un badge : règle dans `ProgressStore` (`BADGES`), illustration dans `badgeArt.js`, textes
  `badge.<id>` et `badge.<id>.desc` dans les deux catalogues ; `tests/js/badges.test.mjs` vérifie
  la cohérence illustration / règle / textes fr-en.
- **Feedback coloré** : déjà en place (vert/rouge de `cells.css`), toujours doublé d'une icône et d'un texte.
