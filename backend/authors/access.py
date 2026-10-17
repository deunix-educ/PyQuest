"""Droit d'utiliser l'éditeur de niveaux : permission `authors.use_editor`, donnée par le groupe « Auteurs »."""

from __future__ import annotations

from django.contrib.auth.models import Group, Permission, User

EDITOR_PERMISSION = "authors.use_editor"
GROUP_NAME = "Auteurs"


def is_author(user: object) -> bool:
    """Compte actif autorisé à utiliser l'éditeur. Un superutilisateur l'est aussi (il a toutes les permissions)."""
    return isinstance(user, User) and user.is_active and user.has_perm(EDITOR_PERMISSION)


def can_read_docs(user: object) -> bool:
    """Documentation en ligne (/docs/) : auteurs et administrateurs (comptes `is_staff`) actifs."""
    return isinstance(user, User) and user.is_active and (user.is_staff or is_author(user))


def authors_group() -> Group:
    """Groupe « Auteurs », créé au besoin avec la permission de l'éditeur."""
    group, _created = Group.objects.get_or_create(name=GROUP_NAME)
    permission = Permission.objects.filter(content_type__app_label="authors", codename="use_editor").first()
    if permission is not None:
        group.permissions.add(permission)
    return group


def grant(user: User) -> None:
    user.groups.add(authors_group())


def revoke(user: User) -> None:
    user.groups.remove(authors_group())
