"""Réglages communs. Le backend ne sert qu'à synchroniser la progression entre appareils."""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

INSTALLED_APPS = ["sync"]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "pyquest_api.urls"
WSGI_APPLICATION = "pyquest_api.wsgi.application"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "fr"
LANGUAGES = [("fr", "Français"), ("en", "English")]
LOCALE_PATHS = [BASE_DIR / "locale"]
USE_I18N = True
USE_TZ = True
TIME_ZONE = "UTC"

# Taille maximale d'une progression synchronisée (octets).
SYNC_MAX_PAYLOAD_BYTES = 256 * 1024
