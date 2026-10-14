"""Réglages de développement : SQLite locale, DEBUG actif, clé non secrète."""

from .base import *  # noqa: F401,F403
from .base import BASE_DIR

DEBUG = True
SECRET_KEY = "dev-only-not-a-secret"  # noqa: S105 - jamais utilisée en production
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}
