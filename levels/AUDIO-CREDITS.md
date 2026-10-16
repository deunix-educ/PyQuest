# Crédits audio / Audio credits

La narration des niveaux est **pré-générée** par synthèse vocale (`make voice`, script
`scripts/generate_voice.py`) ; les fichiers `levels/*/audio/**/*.mp3` et
`app/assets/voice/**/*.mp3` en sont le résultat. Les effets sonores de l'interface sont
synthétisés dans le navigateur (`app/js/core/AudioEngine.js`) et ne reprennent aucun échantillon.

Narration is **pre-generated** with speech synthesis (`make voice`). UI sound effects are
synthesized in the browser and use no samples.

## Moteur / Engine

- [Piper](https://github.com/OHF-Voice/piper1-gpl) (GPL-3.0-or-later), utilisé **uniquement comme
  outil de build** : il n'est pas embarqué dans l'application, seuls les fichiers audio produits
  sont distribués. Piper is used as a build tool only; it is not shipped with the app.

## Voix / Voices (modèles de [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices))

| Langue | Voix | Jeu de données | Licence | Attribution |
|---|---|---|---|---|
| fr | `fr_FR-siwis-medium` | [SIWIS French Speech Synthesis Database](https://datashare.is.ed.ac.uk/handle/10283/2353), University of Edinburgh | CC BY 4.0 | Voix issue de la base SIWIS (Honnet et al., University of Edinburgh), licence CC BY 4.0 : https://creativecommons.org/licenses/by/4.0/ |
| en | `en_US-ljspeech-high` | [LJ Speech](https://keithito.com/LJ-Speech-Dataset/) | Domaine public | — |

Vérifier le `MODEL_CARD` d'une voix avant d'en changer : certaines voix Piper sont sous licence
non commerciale (ex. `en_US-hfc_female-medium`, CC BY-NC-SA) ou copyleft (ex. `fr_FR-tom-medium`,
AGPLv3) et ne conviennent pas à ce projet.
