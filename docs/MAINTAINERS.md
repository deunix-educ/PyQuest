# Guide des mainteneurs

Comment relire, fusionner et publier les contributions. Les contributeurs lisent `CONTRIBUTING.md`.

## Relire un niveau

Les machines ont déjà vérifié (via `make ci`) : schéma, traductions `en`, solutions qui passent leurs
tests, codes de départ qui ne les passent pas, narration à jour. La relecture humaine porte sur ce
qu'elles ne voient pas :

- **Pédagogie** : une seule notion nouvelle par étape ; progression douce depuis le niveau précédent ;
  durée raisonnable (30 à 40 minutes au plus) ; mission concrète et « montrable ».
- **Ton** : phrases courtes, encourageant, jamais condescendant ni culpabilisant ; erreurs présentées comme
  des indices.
- **Justesse** : le Python enseigné est correct et idiomatique ; pas d'approximation trompeuse.
- **Bilingue** : les deux langues disent la même chose (pas une traduction automatique bancale) ;
  mêmes nombres d'indices.
- **Tests** : ils acceptent toutes les bonnes réponses raisonnables sans accepter les mauvaises (attention
  aux sorties exactes trop strictes, aux regex trop larges, aux saisies scriptées qui ne couvrent qu'un cas).
- **Accessibilité** : aucune information transmise par la seule couleur ou le seul son ; images décrites.
- **Sécurité** : le niveau ne contient que du texte, du code de départ et des solutions ; aucun fichier
  exécutable ni lien suspect.

## Narration

Un contributeur peut ne pas pouvoir lancer Piper (téléchargement de voix, `ffmpeg`). Dans ce cas :
1. demander `voice: false` sur ses étapes, ou accepter `voice: true` avec fichiers audio absents le temps de la relecture ;
2. avant de fusionner, un mainteneur lance `make voice`, relit l'audio, et ajoute les fichiers (`levels/<id>/audio/`).
Les voix et leurs licences sont dans `levels/AUDIO-CREDITS.md` : ne changer de voix qu'après avoir lu le `MODEL_CARD`.

## Fusionner et publier

1. Squash ou fusion propre ; le message de commit est en anglais.
2. Sur la branche principale : `make ci-e2e` (ou la CI de la plateforme).
3. `make build` produit `dist/` ; le déployer derrière nginx en HTTPS avec les en-têtes COOP/COEP
   (`nginx/pyquest.conf.example`). Le service worker prend la nouvelle version au chargement suivant.
4. Mettre à jour `CONTEXT.md` si l'état du projet change (niveaux faits, décisions).

## Accepter des contributions de code

Mêmes règles que `CONTRIBUTING.md` : anglais pour le code, commentaires en français, 4 espaces, classes
ES2022, Python typé ; tout comportement dépendant d'une API navigateur est testé dans un vrai navigateur
(`make test-e2e`). Un nouveau kind de test passe par le moteur, jamais par un fichier de niveau.
