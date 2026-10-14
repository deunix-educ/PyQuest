# Choix du moteur Python navigateur

## Tableau comparatif

| Critère | **Pyodide** | Brython | Skulpt | MicroPython-WASM (PyScript) |
|---|---|---|---|---|
| Nature | CPython 3.11/3.12 compilé en WASM (Emscripten) | Transpileur Python→JS | Interpréteur Python écrit en JS | Port WASM de MicroPython (sous-ensemble) |
| Fidélité CPython | **Exacte** (mêmes tracebacks, mêmes types, mêmes erreurs) | Approximative, divergences sur les erreurs et la stdlib | Approximative, divergences connues (int/float, stdlib partielle) | Fidèle sur le cœur du langage, mais stdlib réduite et quelques tracebacks différents |
| Taille initiale | Lourde : ~6–10 Mo compressés pour le cœur (sans numpy/pandas) | Légère : ~1–2 Mo | Légère : ~1 Mo | Très légère : ~200 Ko–1 Mo |
| Démarrage à froid | 2–5 s (device-dépendant), masquable par écran de chargement | < 500 ms | < 500 ms | < 500 ms |
| iOS Safari / WASM | OK depuis iOS 11+, mais limites mémoire WASM et bugs connus sur les anciennes versions ; à tester sur device réel | OK (pas de WASM, donc aucun risque WASM) | OK (idem) | OK, WASM mais empreinte mémoire minime |
| Bibliothèques | Très large (stdlib quasi complète + wheels numpy/pandas/matplotlib via micropip, utile pour les niveaux avancés « traitement de données ») | stdlib partielle, pas de C-extensions | stdlib très partielle | stdlib réduite (pensé embarqué), modules comme `turtle` ou `json` incomplets/absents |
| Hors-ligne (PWA) | Oui, via Service Worker (cache des `.wasm`/`.whl` après 1er chargement) | Oui, trivial (juste du JS) | Oui, trivial | Oui, trivial |
| Maintenance/communauté | Très active (Jupyter, JupyterLite, PyScript) | Faible activité récente | Faible activité récente | Active mais ciblée embarqué, pas pédagogie web |

## Choix retenu : Pyodide

Justification :
- Le brief exige la traduction des **vrais messages d'erreur Python** (`NameError`, etc. —
  exemple 2 du brief). Brython/Skulpt/MicroPython produisent des erreurs qui ressemblent à Python
  mais diffèrent sur les détails, ce qui casserait la promesse pédagogique dès que l'apprenant
  croisera un vrai interpréteur Python ailleurs.
- Les niveaux avancés (POO, fichiers, modules, traitement de données) ont besoin d'une stdlib
  complète et, potentiellement, de `numpy`/`matplotlib` pour des missions visuelles — seul Pyodide
  les propose nativement.
- Le coût (taille, démarrage) est le seul vrai compromis, et le brief l'anticipe explicitement en
  demandant un écran d'attente ludique pendant le chargement — signe que Pyodide est le candidat
  prévu par le cahier des charges.

## Risques Pyodide identifiés et mitigations retenues

1. **iOS Safari / mémoire WASM** : tester sur device réel, limiter la taille du heap Pyodide,
   lazy-load des packages lourds (numpy/pandas) uniquement pour les niveaux qui en ont besoin
   (`micropip`/`loadPackage` à la demande, jamais au chargement initial).
2. **Boucles infinies côté utilisateur** — *décision prise après clarification de l'hébergement* :
   l'utilisateur hébergera sur un **VPS perso**, donc on maîtrise nginx et on peut poser les
   en-têtes `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`.
   Cela active l'**interrupt buffer `SharedArrayBuffer`** de Pyodide, qui devient la méthode
   **principale** de coupure propre et quasi-instantanée des boucles infinies. `worker.terminate()`
   + réinstanciation Pyodide reste un filet de sécurité secondaire (si un navigateur se comporte
   mal), pas le mécanisme principal.

   Config nginx à poser sur le vhost de l'app (pas sur l'API Django séparée) :
   ```nginx
   add_header Cross-Origin-Opener-Policy "same-origin" always;
   add_header Cross-Origin-Embedder-Policy "require-corp" always;
   add_header Cross-Origin-Resource-Policy "same-origin" always;
   ```

   Conséquence directe de `COEP: require-corp` : toute ressource cross-origin sans en-tête `CORP`
   est bloquée silencieusement. Donc :
   - **Pyodide doit être vendorisé** (téléchargé et servi depuis le même domaine), jamais chargé
     depuis `cdn.jsdelivr.net`. Nécessaire de toute façon pour le cache hors-ligne du Service
     Worker — ne coûte rien de plus.
   - Toute police web non-système doit être self-hostée en `.woff2` (pas de Google Fonts en
     cross-origin direct).
   - `fetch()` vers l'API Django (même VPS) n'est **pas** affecté : seules les sous-ressources
     embarquées en mode no-cors (scripts, workers, iframes, images sans CORS) sont concernées par
     COEP, pas les appels `fetch` CORS classiques.
   - HTTPS obligatoire (Let's Encrypt/certbot sur le VPS) : requis à la fois pour le Service Worker
     (PWA) et parce que `COOP`/`COEP` ne s'activent qu'en contexte sécurisé.
3. **`input()` bloquant** : Pyodide ne supporte pas `input()` synchrone dans un Worker. Deux
   options, à choisir niveau par niveau selon le besoin pédagogique : (a) l'interdire dans les
   niveaux débutant (documenté dans le schéma de niveau), (b) la réimplémenter en async côté JS
   avec une UI de saisie qui met la cellule en pause et attend une réponse.
4. **Autoplay audio/voix sur iOS** : exige un geste utilisateur avant tout son. Le premier
   `AudioContext`/`speechSynthesis.speak()` doit être déclenché par un clic existant (ex. le bouton
   « ▶ Exécuter » sert aussi de déblocage), jamais au chargement de page.
