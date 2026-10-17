"""Sonde de santé : le contrôle d'accès de l'éditeur répond 401 sans session (Django et ses réglages sont donc chargés)."""

import os
import sys
import urllib.error
import urllib.request

host = os.environ.get("PYQUEST_ALLOWED_HOSTS", "localhost").split(",")[0]
# Django n'accepte que les noms autorisés et exige l'en-tête du proxy pour ne pas rediriger vers HTTPS.
request = urllib.request.Request(
    "http://127.0.0.1:8000/api/auth/check/",
    headers={"Host": host, "X-Forwarded-Proto": "https"},
)
try:
    urllib.request.urlopen(request, timeout=4)
except urllib.error.HTTPError as error:
    sys.exit(0 if error.code == 401 else 1)
except OSError:
    sys.exit(1)
sys.exit(1)
