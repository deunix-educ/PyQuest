"""Accès authentifié à l'éditeur de niveaux (author.html), pour les déploiements qui le protègent.

nginx interroge `check/` (module auth_request) avant de servir l'éditeur ; `login/` est la page de connexion.
Seuls les comptes `is_staff` (créés avec `manage.py create_author`) passent. Pas de site d'administration
Django : moins de surface d'attaque. Les textes sont dans ce fichier plutôt que dans des catalogues gettext,
car la compilation des traductions (.mo) n'est pas versionnée.
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import LoginFailure

DEFAULT_NEXT = "/author.html"
LOCK_WINDOW = timedelta(minutes=15)
MAX_FAILURES_PER_USER = 5
MAX_FAILURES_PER_IP = 20

TEXTS = {
    "fr": {
        "title": "Éditeur de niveaux — connexion",
        "heading": "Connexion à l'éditeur de niveaux",
        "username": "Identifiant",
        "password": "Mot de passe",
        "submit": "Se connecter",
        "invalid": "Identifiant ou mot de passe incorrect.",
        "locked": "Trop d'essais. Réessaie dans quelques minutes.",
        "signed_in": "Connecté en tant que {name}.",
        "open": "Ouvrir l'éditeur",
        "logout": "Se déconnecter",
    },
    "en": {
        "title": "Level editor — sign in",
        "heading": "Sign in to the level editor",
        "username": "Username",
        "password": "Password",
        "submit": "Sign in",
        "invalid": "Wrong username or password.",
        "locked": "Too many attempts. Try again in a few minutes.",
        "signed_in": "Signed in as {name}.",
        "open": "Open the editor",
        "logout": "Sign out",
    },
}


def _is_author(user: object) -> bool:
    """Compte actif réservé aux auteurs (is_staff) ; les visiteurs anonymes et les autres comptes sont refusés."""
    return isinstance(user, User) and user.is_active and user.is_staff


def _language(request: HttpRequest) -> str:
    header = request.headers.get("Accept-Language", "")
    return "en" if header.lower().startswith("en") else "fr"


def _client_ip(request: HttpRequest) -> str:
    # Derrière nginx, REMOTE_ADDR est le proxy : nginx écrase X-Real-IP, qu'on ne croit qu'en production.
    if settings.TRUST_REAL_IP_HEADER:
        forwarded = request.headers.get("X-Real-IP", "")
        if forwarded:
            return forwarded[:45]
    return request.META.get("REMOTE_ADDR", "")[:45]


def _safe_next(request: HttpRequest) -> str:
    candidate = request.POST.get("next") or request.GET.get("next") or DEFAULT_NEXT
    allowed = url_has_allowed_host_and_scheme(candidate, allowed_hosts={request.get_host()}, require_https=request.is_secure())
    # Chemin local uniquement (pas de //hôte, pas de schéma).
    return candidate if allowed and candidate.startswith("/") and not candidate.startswith("//") else DEFAULT_NEXT


def _is_locked(username: str, ip: str) -> bool:
    since = timezone.now() - LOCK_WINDOW
    recent = LoginFailure.objects.filter(created_at__gte=since)
    return recent.filter(username=username).count() >= MAX_FAILURES_PER_USER or recent.filter(ip=ip).count() >= MAX_FAILURES_PER_IP


def _page(request: HttpRequest, *, error_key: str | None = None, status: int = 200) -> HttpResponse:
    texts = TEXTS[_language(request)]
    user = request.user
    signed_in = _is_author(user)
    context = {
        "t": texts,
        "lang": _language(request),
        "error": texts[error_key] if error_key else None,
        "next": _safe_next(request),
        "signed_in": signed_in,
        "signed_in_text": texts["signed_in"].format(name=user.get_username()) if signed_in else "",
    }
    return render(request, "authors/login.html", context, status=status)


@never_cache
@require_http_methods(["GET", "POST"])
def login_view(request: HttpRequest) -> HttpResponse:
    if request.method == "GET":
        return _page(request)

    username = request.POST.get("username", "").strip().lower()[:150]
    password = request.POST.get("password", "")
    ip = _client_ip(request)
    if _is_locked(username, ip):
        return _page(request, error_key="locked", status=429)

    user = authenticate(request, username=username, password=password)
    if not _is_author(user):
        LoginFailure.objects.create(username=username, ip=ip)
        # Ménage : on ne garde pas l'historique au-delà d'un jour.
        LoginFailure.objects.filter(created_at__lt=timezone.now() - timedelta(days=1)).delete()
        return _page(request, error_key="invalid", status=200)

    LoginFailure.objects.filter(username=username).delete()
    login(request, user)
    return redirect(_safe_next(request))


@never_cache
@require_POST
def logout_view(request: HttpRequest) -> HttpResponse:
    logout(request)
    return redirect("login")


@never_cache
@require_GET
def check_view(request: HttpRequest) -> HttpResponse:
    """Appelé par nginx (auth_request) : 204 si la session appartient à un auteur, sinon 401."""
    return HttpResponse(status=204 if _is_author(request.user) else 401)
