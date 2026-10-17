# Accessibilité et réglages

PyQuest vise le niveau **WCAG 2.2 AA**. Le bouton **Réglages** ouvre le panneau suivant.

## Réglages

| Réglage | Effet |
|---|---|
| Langue | français ou anglais ; le niveau en cours redémarre dans la nouvelle langue |
| Taille du texte | de 80 % à 200 % |
| Thème | automatique (suit ton système), clair ou sombre |
| Personnage-guide | affiche ou masque les bulles d'encouragement |
| Effets sonores / Volume | sons de réussite et d'erreur, désactivables ; « Tester le son » |
| Voix / Vitesse | bouton « Écouter » des explications, désactivable ; « Tester la voix » |
| Voix hors ligne | télécharge les voix de qualité pour les entendre sans connexion (voir ci-dessous) |

Le son et la voix ne démarrent **jamais** tout seuls. Aucune information n'est transmise uniquement par le son ou
par la couleur : chaque résultat est aussi écrit (« Bravo, c'est correct ! », « Pas encore. »).

## Au clavier

Tout est utilisable sans souris.

| Touche | Action |
|---|---|
| `Tab` / `Maj + Tab` | passer d'un contrôle à l'autre |
| `Ctrl + Entrée` (`Cmd + Entrée`) | exécuter la cellule |
| `Échap` | fermer le panneau « Niveaux » ou « Réglages » (le focus revient au bouton d'origine) |
| `Tab` dans l'éditeur de code | indenter ; `Échap` puis `Tab` pour quitter l'éditeur |

Quand un panneau est ouvert, le reste de la page est mis de côté et le focus reste à l'intérieur.

## Lecteurs d'écran

Les contrôles ont des noms explicites, les résultats et erreurs sont annoncés (zones `role="status"`), la carte de
progression et les badges ont leurs états en texte, le dessin du canvas a une description et une liste de traits.

!!! note "Retours bienvenus"
    L'application est testée automatiquement, mais un essai avec un lecteur d'écran réel (Orca, NVDA, VoiceOver)
    reste la meilleure vérification. Si quelque chose n'est pas annoncé ou est confus, signale-le : c'est un
    défaut à corriger.

## Hors ligne

PyQuest est une application web installable (PWA). Après un premier chargement complet, elle fonctionne sans
connexion ; le navigateur peut te proposer de l'installer.

### Les voix hors ligne

Les voix de qualité (Piper) sont des fichiers audio. Le niveau que tu ouvres est **préchargé automatiquement** ; pour tous
les autres, ouvre **Réglages → Voix hors ligne → Télécharger les voix pour le hors ligne** (environ 4 Mo par langue, une
seule fois). Sans cela, hors connexion, seuls les extraits déjà écoutés restent disponibles et le reste est lu par la
voix de ton appareil, plus rudimentaire. Les voix téléchargées survivent aux mises à jour de l'application ; le
téléchargement est à refaire pour l'autre langue si tu en changes.
