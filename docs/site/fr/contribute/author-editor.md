# L'éditeur de niveaux

Un outil intégré pour écrire un niveau **sans écrire de YAML à la main**, et sans serveur.

## Y accéder

1. Lance `make dev` (ou ouvre ton instance).
2. Dans **Réglages**, active **Mode auteur**.
3. Clique sur **Ouvrir l'éditeur de niveaux** (page `/author.html`).

Les apprenants ne voient pas ce lien tant que le mode auteur est désactivé.

!!! note "Sur un serveur protégé"
    Si l'instance a le backend Django, l'accès à `/author.html` demande une connexion (compte autorisé par un
    administrateur dans l'administration Django, voir [Déploiement](../host/deploy.md)). Une fois
    connecté, l'en-tête de l'éditeur affiche ton nom et un bouton **Se déconnecter** (la session dure 8 heures). En local
    (`make dev`), pas de connexion ni de bouton.

## Ce qu'il fait

- **Formulaires** pour les informations du niveau, les étapes (explication ou exercice de code), les tests, les
  indices, les solutions et la mission. Chaque texte est saisi en français **et** en anglais, côte à côte.
- **Vérifications en direct** : conformité au schéma (messages ciblés), traductions manquantes, `requires`,
  solutions manquantes, tests incohérents, expressions régulières invalides, rappel de la narration à générer.
  Un bouton mène au champ en cause.
- **Exécuter les exercices** : lance chaque solution avec le **vrai Python** du navigateur, comme `make test`. La
  solution doit passer ses tests et le code de départ ne doit pas les passer.
- **Essayer** : joue le niveau comme un apprenant, dans la vraie interface (progression jamais enregistrée).
- **Exporter** : télécharge `level.yaml` au style du projet, indique la ligne à ajouter au manifeste et les
  étapes suivantes. Tu peux aussi **importer** un fichier ou charger un niveau existant pour le modifier.
- Ton **brouillon** est enregistré dans le navigateur.

## Après l'export

1. Place `level.yaml` dans `levels/NN-slug/` et ajoute la ligne du manifeste.
2. `make validate-levels` et `make test`.
3. `make voice` pour les étapes narrées.
4. Ouvre ta demande de fusion ([flux de contribution](flow.md)).

## Limites

- La narration ne se génère pas dans le navigateur : `make voice` est nécessaire (l'éditeur te le rappelle).
- Les saisies scriptées sont saisies une par ligne ; une saisie vide au milieu est possible, pas en dernière position.
- L'éditeur aide mais ne remplace pas la relecture : les commandes `make` restent la référence.
