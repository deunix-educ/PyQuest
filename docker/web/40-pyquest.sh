#!/bin/bash
# Exécuté par l'entrée standard de l'image nginx avant son démarrage : vhost selon le mode, certificats, puis
# surveillance périodique (renouvellement et rechargement) en arrière-plan.
set -euo pipefail
pyquest-tls render
pyquest-tls ensure
nohup pyquest-tls loop >/proc/1/fd/1 2>&1 &
