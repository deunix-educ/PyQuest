# Progression et sauvegarde

## XP, badges, série

- **XP (points d'expérience)** : chaque niveau vaut un certain nombre de points, accordés **une seule fois**, quand tu
  réussis sa **mission finale**. Refaire un niveau ne rapporte rien de plus.
- **Badges** : récompenses pour des étapes (premier niveau, trois niveaux, 100 XP, séries de 3 et de 7 jours).
- **Série de jours** : nombre de jours consécutifs où tu as pratiqué. Manquer un jour la remet à 1, sans reproche.

Rien n'est verrouillé : les points et badges ne servent qu'à mesurer ton avancée.

## Où est enregistrée ma progression ?

**Dans ton navigateur**, sur ton appareil (stockage local). Tu n'as rien à faire. Attention : effacer les données
du site, ou changer de navigateur ou d'appareil, la fait disparaître. Deux solutions ci-dessous.

## Sauvegarder dans un fichier (sans serveur)

**Réglages → Sauvegarde de la progression**

- **Exporter ma progression** télécharge un fichier `pyquest-progress-AAAA-MM-JJ.json`.
- **Importer une progression** relit un tel fichier et le **fusionne** avec ta progression actuelle : on garde
  tous les niveaux et badges, on ne perd jamais rien. L'application indique combien de niveaux sont nouveaux.

Garde le fichier ou copie-le sur un autre appareil. Un fichier invalide est refusé sans rien changer.

## Synchroniser entre appareils (facultatif)

Si ton instance PyQuest propose la synchronisation (un serveur avec le module de synchronisation), tu peux
retrouver ta progression partout, **sans créer de compte**.

**Réglages → Synchronisation entre appareils**

1. Sur le premier appareil : **Activer la synchronisation**. Un **jeton secret** est créé et affiché.
2. Sur le second appareil : colle ce jeton dans « colle le jeton d'un autre appareil » puis **Lier cet appareil**.
   Les deux progressions sont fusionnées.
3. Ensuite, tout est automatique : au démarrage, au retour du réseau, et peu après chaque niveau terminé.
   **Synchroniser maintenant** force un échange.

!!! warning "Le jeton est comme un mot de passe"
    Il donne accès à ta progression. Ne le partage pas. **S'il est perdu, il ne peut pas être récupéré** : le
    serveur n'en garde qu'une empreinte. Fais aussi une sauvegarde par fichier.

- **Désactiver (garder les données du serveur)** arrête la synchronisation sur cet appareil.
- **Désactiver et effacer les données du serveur** supprime définitivement ce qui est stocké pour ce jeton.
- **Hors ligne** ou serveur indisponible : un message l'indique, ta progression locale reste intacte et la
  synchronisation reprendra seule.
