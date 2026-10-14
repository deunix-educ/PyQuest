# Résumé fidèle du brief original

Source : [`prompt-pyquest.md`](../../prompt-pyquest.md) à la racine du dépôt.

## Rôle demandé à Claude
Architecte logiciel senior (PWA/WASM/Pyodide, Python, JS moderne) + ingénieur pédagogique
(didactique de la programmation, gamification) + designer UX/UI (WCAG 2.2 AA). Ton : mentor
bienveillant et rigoureux, qui justifie chaque choix technique et pédagogique.

## Objectif
Concevoir puis développer **PyQuest** : application web multiplateforme pour apprendre Python par
l'exemple et la pratique, via une console interactive façon Jupyter simplifiée, avec contenus
progressifs, visuels et sonores — priorité absolue : maintenir l'attention et prévenir l'abandon.

## Public et pédagogie
- Du grand débutant absolu (« ne connaît pas le mot variable ») à l'apprenant avancé (POO,
  fichiers, modules, mini-jeux, données).
- Apprentissage par l'exemple concret et exécutable, puis modification guidée.
- Progression en micro-étapes : **une seule notion nouvelle par écran**.
- Chaque niveau se termine par une **mission** motivante (ex. : calculatrice de pourboire, jeu du
  nombre mystère, générateur de mots de passe, mini-agenda, jeu de dessin).
- Retour immédiat, encourageant, explicatif ; traduction des erreurs Python en langage simple.

## Interaction
Console à cellules (code + sortie + explication), simplifiée par rapport à Jupyter : boutons
« Exécuter », « Réinitialiser », « Indice », « Voir la solution » ; raccourci Ctrl/Cmd+Entrée ;
aucune notion de kernel exposée au débutant.

## Multimédia / engagement
- Visuel : canvas type `turtle`, graphiques simples, affichage riche.
- Son : effets courts (succès, erreur, niveau débloqué) via Web Audio API, désactivables.
- Voix synthétique optionnelle (`speechSynthesis`), fr/en, vitesse réglable.
- Gamification : XP, badges, streaks, carte de progression, personnage-guide.

## Contraintes techniques impératives
- Python exécuté **dans le navigateur** (Pyodide/WASM), dans un **Web Worker** (jamais de blocage
  de l'UI), indépendant de l'OS hôte (Linux/Windows/macOS/ChromeOS/Android/iOS).
- **PWA installable**, fonctionnement hors ligne après premier chargement.
- **Niveaux modulaires en plug-in** : ajouter un niveau = déposer un fichier déclaratif
  (YAML/JSON + Markdown) + le référencer dans un manifeste, **sans toucher au code de l'app**.
  Format validé par JSON Schema.
- Validation automatique des exercices par tests déclarés dans le fichier de niveau (sortie
  attendue, valeur de variable, appel de fonction).
- Progression stockée localement (IndexedDB), export/import ; backend **Django optionnel**
  uniquement pour la sync multi-appareils, jamais requis.
- Sécurité : exécution isolée du code utilisateur, délai maximal d'exécution (anti boucle
  infinie), aucune donnée personnelle collectée.

## Lecteurs cibles des livrables
- **Développeur** (Python/Django, MicroPython, C/C++, Debian, VSCodium) : rigueur technique,
  détail par composant, pas de remplissage.
- **Apprenant final** (dans les contenus pédagogiques) : ton chaleureux, phrases courtes,
  vocabulaire simple, chaque terme technique défini à sa première apparition, tutoiement.

## Format de réponse attendu (8 points, dans l'ordre)
1. Analyse comparative des moteurs Python-navigateur (Pyodide/Brython/Skulpt/MicroPython-WASM) +
   choix motivé.
2. Schéma d'architecture Mermaid (interface, Web Worker Python, moteur de leçons, moteur de
   validation, moteur audio/voix, stockage, service worker).
3. Arborescence complète du projet.
4. Spécification du format de niveau : JSON Schema commenté + un exemple complet de niveau.
5. Parcours pédagogique : tableau des niveaux (du niveau 0 jusqu'aux projets avancés), avec par
   niveau : notions, mission finale, visuel/son associé, durée estimée.
6. Stratégie anti-abandon : mécanismes + justification.
7. Code : socle fonctionnel (console à cellules, worker Pyodide, chargeur de niveaux, validateur,
   audio/voix, progression) + **3 premiers niveaux**, fichiers complets, prêts à exécuter.
8. Outillage : Makefile, configuration, README, procédure pour ajouter un niveau.

## Instructions personnalisées imposées
- Code en anglais, commentaires en français.
- Indentation 4 espaces partout (sauf tabulations imposées par `make`).
- JS en classes ES modules, pas de framework lourd sans justification.
- Python typé, compatible pyright (`pyrightconfig.json`).
- Interface et contenus bilingues fr/en, fr par défaut.
- `README.md` (fr) + `README-EN.md` (en).
- `Makefile` : install, dev server, validation des niveaux, build prod, tests, clean.
- Si backend Django : settings dev/prod séparés, traductions fr/en, doc MkDocs bilingue.
- `.gitattributes` + `.gitignore` strict (aucun secret).
- Projet open source : licence adaptée + `CONTRIBUTING.md` (comment contribuer un niveau).
- Accessibilité : clavier complet, contrastes, mode sombre/clair, taille de police réglable,
  son/voix désactivables, rien transmis uniquement par le son/la couleur.
- Performance : premier affichage interactif < 3 s hors chargement Pyodide, écran d'attente ludique
  pendant ce chargement.
- Ne pas inventer d'API incertaine ; signaler et prévoir un repli.
- Pas de dépendance à un service payant ou propriétaire.

## Raisonnement demandé avant le code
Expliciter avant de coder : besoins par profil d'apprenant et points de décrochage typiques ;
contraintes de compatibilité (surtout iOS Safari : mémoire, WASM, autoplay audio, voix
disponibles) et solutions retenues ; découpage en composants et interfaces ; risques (chargement
Pyodide, boucles infinies, `input()` bloquant, accessibilité) et parades.

## Exemples fournis dans le brief (à respecter pour le ton et le format)
- Un extrait de fichier de niveau YAML (id, title fr/en, difficulty, xp, steps avec explain/code,
  tests, hints, mission).
- Une traduction d'erreur type : explique le `NameError` en langage simple avec émojis 🔍/💡.
- Un message de réussite type : ton enthousiaste, XP gagnés, encouragement à continuer.
