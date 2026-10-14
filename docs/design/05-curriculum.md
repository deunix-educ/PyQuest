# Parcours pédagogique

| Niveau | Notions nouvelles | Mission finale | Visuel / Son | Durée estimée |
|---|---|---|---|---|
| **00** — Qu'est-ce qu'un programme ? | Ordre, instruction, programme = suite d'instructions (sans code) | Aucune mission codée — clic « Je comprends » après une animation | Animation simple (étapes qui s'exécutent une à une) · `level_unlocked` | 5 min |
| **01** — Ton premier programme | `print()`, chaînes de caractères | Carte de visite (nom, ville, loisir) | Texte stylé affiché en sortie · `success_small` | 10 min |
| **02** — Variables et types | Variables, `str`/`int`/`float`, affectation | Calculatrice de pourboire | Résultat formaté (tableau simple) · `success_small` | 15 min |
| **03** — Demander à l'utilisateur | `input()`, conversion `int()`/`float()` | « Combien de bougies ? » (calcul d'âge à partir d'une année) | — · `success_small` | 15 min |
| **04** — Calculer | Opérateurs arithmétiques, `%`, priorités | Convertisseur d'unités (km ↔ miles, °C ↔ °F) | — · `success_small` | 15 min |
| **05** — Décider | `if`/`elif`/`else`, booléens, comparaisons | Jeu du nombre mystère (version à un seul essai) | Feedback coloré (vert/rouge) · `success_small` | 20 min |
| **06** — Répéter avec une liste | `for`, listes, `random.choice` | Générateur de mots de passe (v1 : mots tirés d'une liste) | — · `success_big` | 20 min |
| **07** — Répéter avec une condition | `while`, `break`, boucle infinie (et comment l'éviter) | Jeu du nombre mystère (version complète, essais illimités) | — · `success_big` | 20 min |
| **08** — Découper en fonctions | `def`, paramètres, `return` | Mini-agenda v1 (ajouter/afficher un rendez-vous) | — · `success_small` | 25 min |
| **09** — Structurer les données | Dictionnaires, listes de dictionnaires | Mini-agenda v2 (plusieurs rendez-vous, recherche) | Tableau affiché · `success_small` | 25 min |
| **10** — Garder une trace | Fichiers (`open`, lecture/écriture, `with`) | Mini-agenda v3 (sauvegarde entre les sessions) | — · `success_big` | 20 min |
| **11** — Utiliser des bibliothèques | `import`, `random`, `string`, `datetime` | Générateur de mots de passe v2 (longueur, critères de complexité) | — · `success_small` | 20 min |
| **12** — Gérer les erreurs | `try`/`except` | Calculatrice de pourboire robuste (ne plante jamais) | — · `success_small` | 15 min |
| **13** — Créer ses objets | Classes, `__init__`, méthodes | Jeu de dessin (classe `Crayon` façon `turtle`) | Canvas de dessin interactif · `level_unlocked` | 30 min |
| **14** — Projet libre guidé | Combine POO + fichiers + modules | Jeu de dessin avec motifs sauvegardés et rechargeables | Canvas + galerie de motifs · `success_big` | 40 min |

## Logique du séquençage

- 00–07 (~2h) : cœur impératif (affichage, variables, entrées, conditions, boucles).
- 08–12 (~1h45) : structuration et robustification (fonctions, structures de données, fichiers,
  modules, erreurs).
- 13–14 (~1h10) : POO, volontairement en fin de parcours car c'est la notion la plus abstraite
  pour un débutant, introduite via un livrable visuel fort (dessin) plutôt qu'un exemple théorique.

Les missions nommées dans le brief sont toutes couvertes : calculatrice de pourboire (02, 12),
jeu du nombre mystère (05, 07), générateur de mots de passe (06, 11), mini-agenda (08–10), jeu de
dessin (13–14).

**Les 3 premiers niveaux à coder en priorité (point 7 du brief) sont 00, 01, 02** — cf. `CONTEXT.md`.
