"""Site d'administration de PyQuest : gestion des comptes, avec la même protection contre la force brute que la
page de connexion de l'éditeur."""

from __future__ import annotations

from django.contrib import admin
from django.http import HttpRequest, HttpResponse
from django.template.response import TemplateResponse

from .throttle import client_ip, is_locked, record_failure, record_success


class PyQuestAdminSite(admin.AdminSite):
    site_header = "PyQuest — administration"
    site_title = "PyQuest"
    index_title = "Comptes et accès à l'éditeur de niveaux"

    def login(self, request: HttpRequest, extra_context: dict[str, object] | None = None) -> HttpResponse:
        if request.method != "POST":
            return super().login(request, extra_context)
        username = request.POST.get("username", "").strip().lower()[:150]
        ip = client_ip(request)
        if is_locked(username, ip):
            return HttpResponse("Trop d'essais. Réessaie dans quelques minutes.", status=429, content_type="text/plain; charset=utf-8")
        response = super().login(request, extra_context)
        if request.user.is_authenticated:
            record_success(username)
        elif isinstance(response, TemplateResponse):
            record_failure(username, ip)
        return response


site = PyQuestAdminSite(name="admin")
