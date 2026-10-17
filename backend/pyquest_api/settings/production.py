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

# Base de données : MariaDB/MySQL (pilote `mysqlclient`, backend/requirements-prod.txt, jeu de caractères utf8mb4) ou,
# pour une installation légère en intranet (deploy/install_intranet.sh), un fichier SQLite (PYQUEST_DB_ENGINE=sqlite).
if os.environ.get("PYQUEST_DB_ENGINE", "mysql") == "sqlite":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": _required("PYQUEST_DB_PATH"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": _required("PYQUEST_DB_NAME"),
            "USER": _required("PYQUEST_DB_USER"),
            "PASSWORD": _required("PYQUEST_DB_PASSWORD"),
            "HOST": os.environ.get("PYQUEST_DB_HOST", "127.0.0.1"),
            "PORT": os.environ.get("PYQUEST_DB_PORT", "3306"),
            "OPTIONS": {"charset": "utf8mb4"},
            "CONN_MAX_AGE": 60,
        }
    }

# Derrière nginx en HTTPS.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_CONTENT_TYPE_NOSNIFF = True

# Origines publiques exactes (https://domaine, séparées par des virgules si le site a plusieurs noms ou une adresse IP) :
# requises pour les formulaires POST (connexion) derrière le proxy.
CSRF_TRUSTED_ORIGINS = [origin.strip() for origin in _required("PYQUEST_ORIGIN").split(",") if origin.strip()]
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
TRUST_REAL_IP_HEADER = True  # nginx écrase X-Real-IP (voir nginx/pyquest.conf.example)
STATIC_ROOT = os.environ.get("PYQUEST_STATIC_ROOT", "/var/www/pyquest/static")  # servi par nginx : /api/static/
