# Format de niveau — notes de conception

Schéma complet et à jour : [`levels/schema/level.schema.json`](../../levels/schema/level.schema.json).

**Un exemple complet de niveau conforme à ce schéma reste à écrire** (fait partie du point 7 du
brief, en même temps que le code du socle — voir `CONTEXT.md`). Le brief fournit un extrait de
style à respecter (ton, structure YAML), repris dans `00-brief-summary.md`.

## Organisation des fichiers

- Un dossier par niveau : `levels/<id>/level.yaml` (+ `.md` optionnel si les textes `explain`
  deviennent longs — pas nécessaire tant que les textes restent courts, cf. contrainte « phrases
  courtes » du brief).
- `levels/manifest.json` fixe l'ordre d'affichage et les dépendances (`requires: ["00-intro"]`).

## Points de conception actés

- **`tests[].kind` en enum fermé** (pas de DSL extensible) : force tout nouveau type de validation
  à passer par une évolution du moteur, pas du contenu — garantit qu'aucun fichier de niveau ne
  peut injecter du code arbitraire. Cohérent avec la contrainte de sécurité du brief (« exécution
  isolée du code utilisateur »). Choix délibéré ; à revoir uniquement si un besoin de validation
  non anticipé apparaît souvent.
- **`en` non `required`** dans `i18nString` : permet de contribuer un niveau en français seul. Le
  `CONTRIBUTING.md` (à écrire, point 8) devra exiger `en` avant merge via une étape de CI, sans
  que ça bloque la validation JSON Schema elle-même.
- **Validation CLI** : `scripts/validate_levels.py` (à écrire, point 7/8) doit valider chaque
  `level.yaml` contre ce schéma — cible Makefile `make validate-levels`.
