# Les installateurs : VPS et intranet

Deux scripts font, **d'une seule commande**, tout ce qu'on ferait à la main. Ils se lancent **en root sur le serveur**,
depuis un clone du dépôt (hors de `/root` et `/home`, par exemple `/opt/PyQuest`), sur **Debian ou Ubuntu**. Ils sont
**idempotents** : après une interruption, on relance la même commande. `--dry-run` affiche tout ce qui serait fait sans
rien modifier ; `--yes` supprime les questions (pour automatiser).

| | VPS public | Réseau intranet (lycée) |
|---|---|---|
| Script | `deploy/install_vps.sh` | `deploy/install_intranet.sh` |
| Adresse du site | un **nom de domaine** public | un nom du DNS interne **ou une adresse IP** |
| HTTPS | certificat **Let's Encrypt** (renouvelé par certbot) | **autorité de certification interne** créée par l'installateur |
| Base de données | **MariaDB** | **SQLite** (un fichier, rien à administrer) |
| Accès à Internet du serveur | permanent | pendant l'installation seulement (paquets, moteur Python) |
| Les postes doivent… | rien | faire confiance à l'autorité, **une fois** |

## Installer sur un VPS

Prérequis : le nom de domaine pointe déjà vers le VPS (enregistrement A/AAAA), les ports 80 et 443 sont libres ou tenus
par nginx, une adresse e-mail pour Let's Encrypt.

```bash
git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest && cd /opt/PyQuest
./deploy/install_vps.sh --domain pyquest.example.org --email toi@example.org --dry-run   # simulation
./deploy/install_vps.sh --domain pyquest.example.org --email toi@example.org
```

L'installateur enchaîne : contrôles préalables (le nom se résout-il ? les ports sont-ils libres ?), `server_setup.sh`
(paquets, utilisateur, environnement Python, nginx, certificat et son renouvellement), installation de MariaDB si elle
manque (après confirmation), `db_setup.sh` (base, utilisateur, mot de passe généré ; le mot de passe de l'administrateur
MariaDB est demandé), démarrage du service, création du premier administrateur, `server_update.sh` (construction et
publication), sauvegarde quotidienne, et un diagnostic final. Options : `--db-admin-user`, `--port`, `--no-admin`.

## Installer dans un réseau intranet

Prérequis : un serveur Debian/Ubuntu du réseau (une petite machine suffit), joignable par les postes, avec un accès à
Internet **le temps de l'installation**. Choisir comment les postes l'appelleront : un nom (à déclarer dans le DNS du
réseau) et/ou son adresse IP **fixe**.

```bash
git clone git@github.com:deunix-educ/PyQuest.git /opt/PyQuest && cd /opt/PyQuest
./deploy/install_intranet.sh --host pyquest.lycee.local,192.168.1.20 --dry-run
./deploy/install_intranet.sh --host pyquest.lycee.local,192.168.1.20
```

L'installateur crée l'autorité de certification (`/etc/pyquest/tls/ca.crt`) et le certificat du serveur pour **chaque nom
et adresse** donnés, configure nginx (HTTPS, éditeur de niveaux protégé, administration), la base SQLite
(`/var/lib/pyquest/db.sqlite3`), le service, la publication du site et deux tâches planifiées : sauvegarde quotidienne et
renouvellement mensuel du certificat du serveur. Il propose de créer le premier administrateur.

### Pourquoi HTTPS, même en intranet ?

Sans HTTPS (hors `localhost`), le navigateur désactive le service worker (donc le mode hors ligne et l'installation de
l'application) et l'isolation qui permet d'interrompre une boucle infinie et d'utiliser `input()`. L'installateur règle
cela une fois pour toutes ; il faut seulement que les postes **fassent confiance à l'autorité de l'établissement**.

### Faire confiance à l'autorité sur les postes

- **Un poste à la fois** : ouvrir `http://pyquest.lycee.local/ca` (page fournie par le serveur), télécharger
  `pyquest-ca.crt` et suivre les instructions de la page (Windows, Firefox, Linux, Android, iOS).
- **Tout un parc** : l'administrateur du réseau importe `pyquest-ca.crt` dans les autorités racines de confiance par la
  stratégie de groupe (Windows) ou l'outil de gestion des postes. Firefox suit le magasin du système si l'option
  `security.enterprise_roots.enabled` est activée.

Cette opération ne se fait **qu'une fois** : le certificat du serveur est réémis automatiquement, mais l'autorité (valable
dix ans) ne change pas.

### À garder en tête

- **Sauvegarder `/etc/pyquest/tls/ca.key`** hors du serveur, en lieu sûr : c'est la clé de l'autorité. La perdre oblige à
  refaire la confiance sur tous les postes ; la divulguer permettrait de se faire passer pour le serveur. Ne jamais la
  distribuer : seuls `ca.crt` et la page `/ca` sont publics.
- **Comptes** : les élèves n'ont pas de compte (la progression reste dans leur navigateur, la synchronisation est
  facultative). Les enseignants-auteurs se créent dans `https://pyquest.lycee.local/api/admin/`.
- **Postes partagés : un profil de navigateur par élève.** La progression est enregistrée dans le navigateur, par profil.
  Le plus simple est une **session par élève** (Windows ou Linux), chacun ayant ainsi son profil Chrome, Edge ou Firefox ;
  si les sessions sont sur un profil itinérant (dossier personnel sur le réseau), la progression suit l'élève d'un poste à
  l'autre. Sans session individuelle, créer un profil de navigateur par élève (Chrome : icône de profil › *Ajouter* ; Firefox :
  `about:profiles`). Un seul profil partagé par toute la classe mélangerait les progressions, et la fonction « Effacer »
  des données du navigateur les supprimerait.
- **Si l'élève change de poste sans profil itinérant** : la **synchronisation** (Réglages › Synchronisation) relie les
  appareils par un code secret que l'élève note ; la sauvegarde en fichier (Réglages › Sauvegarde) sert de secours.
- **Mises à jour** : `cd /opt/PyQuest && git pull && ./scripts/server_update.sh` (accès à Internet requis seulement pour
  `git pull` et un éventuel nouveau moteur Python).
- **Diagnostic** : `./scripts/vps_doctor.sh` (reconnaît l'installation intranet : validité du certificat, tâche de
  renouvellement, base SQLite, sauvegardes).
- **Restauration d'une sauvegarde** : arrêter le service (`systemctl stop pyquest`), `gunzip < sauvegarde.sqlite.gz >
  /var/lib/pyquest/db.sqlite3`, `chown pyquest:pyquest` sur le fichier, `systemctl start pyquest`.

Les détails d'exploitation (mises à jour, retour arrière, dépannage) sont ceux de [Mise en service et
exploitation](operations.md), dont l'intranet partage les scripts.
