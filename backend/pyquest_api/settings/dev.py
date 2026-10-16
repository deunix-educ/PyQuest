"""Réglages de développement : SQLite locale, DEBUG actif, clé non secrète."""

import os

from .base import *  # noqa: F401,F403
from .base import BASE_DIR

DEBUG = True
SECRET_KEY = "dev-only-not-a-secret"  # noqa: S105 - jamais utilisée en production
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        # PYQUEST_DB_PATH : base jetable (tests de bout en bout), sans toucher à la base de dev.
        "NAME": os.environ.get("PYQUEST_DB_PATH", BASE_DIR / "db.sqlite3"),
    }
}

# Dossier des fichiers statiques collectés (essai avec nginx : scripts/local_stack.py).
STATIC_ROOT = os.environ.get("PYQUEST_STATIC_ROOT", BASE_DIR / "staticfiles")
