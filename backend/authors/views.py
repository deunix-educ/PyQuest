"""Accès authentifié à l'éditeur de niveaux (author.html), pour les déploiements qui le protègent.

nginx interroge `check/` (module auth_request) avant de servir l'éditeur ; `login/` est la page de connexion.
Seuls les comptes qui ont la permission `authors.use_editor` (groupe « Auteurs », donné depuis l'administration
ou avec `manage.py create_author`) passent ; `is_staff` ouvre l'administration, pas l'éditeur.
Les textes sont dans ce fichier plutôt que dans des catalogues gettext, car la compilation des traductions (.mo) n'est
pas versionnée.
"""

from __future__ import annotations

from django.contrib.auth import authenticate, login, logout
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .access import can_read_docs, is_author
from .throttle import client_ip, is_locked, record_failure, record_success

DEFAULT_NEXT = "/author.html"

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


def _language(request: HttpRequest) -> str:
    header = request.headers.get("Accept-Language", "")
    return "en" if header.lower().startswith("en") else "fr"


def _safe_next(request: HttpRequest) -> str:
    candidate = request.POST.get("next") or request.GET.get("next") or DEFAULT_NEXT
    allowed = url_has_allowed_host_and_scheme(candidate, allowed_hosts={request.get_host()}, require_https=request.is_secure())
    # Chemin local uniquement (pas de //hôte, pas de schéma).
    return candidate if allowed and candidate.startswith("/") and not candidate.startswith("//") else DEFAULT_NEXT


def _page(request: HttpRequest, *, error_key: str | None = None, status: int = 200) -> HttpResponse:
    texts = TEXTS[_language(request)]
    user = request.user
    signed_in = is_author(user)
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
    ip = client_ip(request)
    if is_locked(username, ip):
        return _page(request, error_key="locked", status=429)

    user = authenticate(request, username=username, password=password)
    if not is_author(user):
        record_failure(username, ip)
        return _page(request, error_key="invalid", status=200)

    record_success(username)
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
    return HttpResponse(status=204 if is_author(request.user) else 401)


@never_cache
@require_GET
def check_docs_view(request: HttpRequest) -> HttpResponse:
    """Appelé par nginx (auth_request) pour /docs/ : 204 pour un auteur ou un administrateur, sinon 401."""
    return HttpResponse(status=204 if can_read_docs(request.user) else 401)


@never_cache
@require_GET
def me_view(request: HttpRequest) -> HttpResponse:
    """Identité de l'auteur connecté (pour l'afficher dans l'éditeur) et jeton CSRF du formulaire de déconnexion."""
    if not is_author(request.user):
        return HttpResponse(status=401)
    return JsonResponse({"username": request.user.get_username(), "csrf": get_token(request)})
