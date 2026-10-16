# Écrire et exécuter du code

## Les cellules

Chaque exercice a une **cellule** : une zone de code, et dessous la sortie et le résultat de la validation.

| Action | Comment |
|---|---|
| Exécuter | bouton **Exécuter** ou `Ctrl + Entrée` (`Cmd + Entrée` sur Mac) |
| Arrêter un programme qui tourne | bouton **Arrêter** (utile contre une boucle infinie) |
| Réinitialiser | bouton **Réinitialiser** : remet le code de départ |
| Indice | bouton **Indice** : un indice de plus à chaque clic |
| Solution | « Voir la solution », sous la cellule |

Entre deux exécutions, **les variables sont conservées** d'une cellule à l'autre dans un même niveau, comme dans
un notebook.

## Indenter avec la touche Tab

Python se structure par l'indentation. Dans l'éditeur :

- **Tab** insère des espaces (4, alignés sur la colonne suivante) ; avec plusieurs lignes sélectionnées, il les
  indente toutes.
- **Maj + Tab** désindente.
- **Échap puis Tab** fait **sortir** du champ de code, pour continuer à naviguer au clavier sans rester bloqué.
  Dès que tu retapes dans l'éditeur, Tab indente de nouveau.

## Les erreurs

Quand ton code plante, PyQuest affiche :

- le **type** de l'erreur traduit (« Python ne connaît pas ce nom ») ;
- une **explication** en langage simple et un **conseil** ;
- la **ligne** concernée ;
- le message technique réel de Python, dans « Détail technique », pour apprendre à le lire.

## Saisir des données avec `input()`

Quand ton programme appelle `input("Ton prénom ? ")`, un champ de saisie apparaît sous la sortie : tape ta réponse
et valide avec **Entrée** ou le bouton **Envoyer**. La question est affichée comme dans un vrai terminal.

!!! note
    La saisie interactive demande que la page soit servie avec les en-têtes d'isolation (voir
    [Déploiement](../host/deploy.md)). Sans eux, `input()` lève une erreur `EOFError` : c'est un problème
    d'hébergement, pas de ton code.

## Les fichiers

Python peut lire et écrire des fichiers. Dans le navigateur, **seul le dossier `data/` est conservé** quand tu
fermes la page (par exemple `open("data/agenda.txt", "w")`). Tout fichier écrit ailleurs disparaît au
rechargement.

## Dessiner avec `canvas`

À partir du niveau 13, tu disposes d'une feuille de dessin :

```python
import canvas

canvas.line(0, 0, 100, 0, "red")      # un trait rouge de (0, 0) à (100, 0)
canvas.line(0, 0, 0, 100, "blue")
```

- Le point `(0, 0)` est au **centre** ; les nombres positifs vont vers la **droite** et vers le **haut**, jusqu'à 200.
- Couleurs : `black`, `red`, `green`, `blue`, `orange`, `purple`, `gray`.
- `canvas.clear()` efface la feuille. **Chaque exécution repart d'une feuille vierge.**
- Le dessin s'affiche sous la cellule, avec une **description écrite** et la **liste de tous les traits**
  (« Voir la liste des traits ») : rien n'est transmis par la seule image.
