"""Administration des comptes : qui peut utiliser l'éditeur de niveaux, qui administre le site."""

from __future__ import annotations

from django.contrib import admin, messages
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group, User
from django.db.models import QuerySet
from django.http import HttpRequest

from . import access
from .sites import site


@admin.register(User, site=site)
class AccountAdmin(UserAdmin):
    list_display = ("username", "is_author_display", "is_staff", "is_superuser", "is_active", "last_login")
    list_filter = ("is_staff", "is_superuser", "is_active", "groups")
    actions = ["grant_editor", "revoke_editor"]

    @admin.display(boolean=True, description="Éditeur de niveaux")
    def is_author_display(self, obj: User) -> bool:
        return access.is_author(obj)

    @admin.action(description="Autoriser à utiliser l'éditeur de niveaux")
    def grant_editor(self, request: HttpRequest, queryset: QuerySet[User]) -> None:
        for user in queryset:
            access.grant(user)
        self.message_user(request, f"{queryset.count()} compte(s) autorisé(s) à utiliser l'éditeur.", messages.SUCCESS)

    @admin.action(description="Retirer l'accès à l'éditeur de niveaux")
    def revoke_editor(self, request: HttpRequest, queryset: QuerySet[User]) -> None:
        for user in queryset:
            access.revoke(user)
        self.message_user(request, f"Accès retiré à {queryset.count()} compte(s).", messages.SUCCESS)


site.register(Group, GroupAdmin)
