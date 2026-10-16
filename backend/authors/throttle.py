"""Limitation des essais de connexion (force brute), partagée par la page de l'éditeur et l'administration."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.http import HttpRequest
from django.utils import timezone

from .models import LoginFailure

LOCK_WINDOW = timedelta(minutes=15)
MAX_FAILURES_PER_USER = 5
MAX_FAILURES_PER_IP = 20


def client_ip(request: HttpRequest) -> str:
    # Derrière nginx, REMOTE_ADDR est le proxy : nginx écrase X-Real-IP, qu'on ne croit qu'en production.
    if settings.TRUST_REAL_IP_HEADER:
        forwarded = request.headers.get("X-Real-IP", "")
        if forwarded:
            return forwarded[:45]
    return request.META.get("REMOTE_ADDR", "")[:45]


def is_locked(username: str, ip: str) -> bool:
    since = timezone.now() - LOCK_WINDOW
    recent = LoginFailure.objects.filter(created_at__gte=since)
    return recent.filter(username=username).count() >= MAX_FAILURES_PER_USER or recent.filter(ip=ip).count() >= MAX_FAILURES_PER_IP


def record_failure(username: str, ip: str) -> None:
    LoginFailure.objects.create(username=username, ip=ip)
    # Ménage : on ne garde pas l'historique au-delà d'un jour.
    LoginFailure.objects.filter(created_at__lt=timezone.now() - timedelta(days=1)).delete()


def record_success(username: str) -> None:
    LoginFailure.objects.filter(username=username).delete()
