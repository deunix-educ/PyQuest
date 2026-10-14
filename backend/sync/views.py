"""API de synchronisation : GET/PUT de la progression, authentifiée par un jeton Bearer.

Le serveur ne fait que stocker le dernier JSON exporté par `ProgressStore` ; la fusion entre
appareils reste côté client (ProgressStore.import, mode `merge`).
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.utils.translation import gettext as _
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import SyncProfile

# Jeton généré par le client (32 à 128 caractères URL-safe) : ~190 bits d'entropie au minimum.
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32,128}$")


def _error(message: str, status: int) -> JsonResponse:
    return JsonResponse({"error": message}, status=status)


def _token_hash(request: HttpRequest) -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _sep, token = header.partition(" ")
    if scheme.lower() != "bearer" or not TOKEN_PATTERN.match(token):
        return None
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _parse_payload(request: HttpRequest) -> tuple[dict[str, Any] | None, str | None]:
    if len(request.body) > settings.SYNC_MAX_PAYLOAD_BYTES:
        return None, _("Payload too large.")
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return None, _("Invalid JSON.")
    payload = data.get("payload") if isinstance(data, dict) else None
    if not isinstance(payload, dict) or not isinstance(payload.get("version"), int):
        return None, _("Invalid progress payload.")
    return payload, None


# Pas de cookie ni de session : l'authentification est le jeton Bearer, donc pas de CSRF.
@csrf_exempt
@require_http_methods(["GET", "PUT"])
def progress(request: HttpRequest) -> JsonResponse:
    token_hash = _token_hash(request)
    if token_hash is None:
        return _error(_("Missing or malformed token."), 401)

    if request.method == "GET":
        profile = SyncProfile.objects.filter(token_hash=token_hash).first()
        if profile is None:
            return _error(_("No progress stored for this token."), 404)
        return JsonResponse({"payload": profile.payload, "updated_at": profile.updated_at.isoformat()})

    payload, problem = _parse_payload(request)
    if payload is None:
        return _error(problem or _("Invalid request."), 400)
    profile, _created = SyncProfile.objects.update_or_create(token_hash=token_hash, defaults={"payload": payload})
    return JsonResponse({"updated_at": profile.updated_at.isoformat()})
