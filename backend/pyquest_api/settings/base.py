"""Réglages communs. Le backend sert à synchroniser la progression entre appareils et à protéger l'accès à
l'éditeur de niveaux (comptes auteurs). Il n'est jamais requis pour apprendre."""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.admin",
    "sync",
    "authors.apps.AuthorsConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

# Fichiers statiques de l'administration, servis par nginx sous /api/static/ (python manage.py collectstatic).
STATIC_URL = "/api/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Session des auteurs (éditeur de niveaux) : cookie HttpOnly, 8 heures.
SESSION_COOKIE_NAME = "pyquest_author"
SESSION_COOKIE_AGE = 8 * 60 * 60
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_NAME = "pyquest_csrf"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Vrai seulement derrière nginx, qui écrase X-Real-IP : sert à limiter les essais de connexion par adresse.
TRUST_REAL_IP_HEADER = False

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
