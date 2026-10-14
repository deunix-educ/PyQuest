"""Réglages de production : tout secret vient de l'environnement, rien n'est commité."""

import os

from .base import *  # noqa: F401,F403


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


DEBUG = False
SECRET_KEY = _required("PYQUEST_SECRET_KEY")
ALLOWED_HOSTS = _required("PYQUEST_ALLOWED_HOSTS").split(",")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": _required("PYQUEST_DB_NAME"),
        "USER": _required("PYQUEST_DB_USER"),
        "PASSWORD": _required("PYQUEST_DB_PASSWORD"),
        "HOST": os.environ.get("PYQUEST_DB_HOST", "127.0.0.1"),
        "PORT": os.environ.get("PYQUEST_DB_PORT", "5432"),
    }
}

# Derrière nginx en HTTPS.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_CONTENT_TYPE_NOSNIFF = True
