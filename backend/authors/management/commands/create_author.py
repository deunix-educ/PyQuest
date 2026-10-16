"""Crée (ou met à jour le mot de passe d') un compte auteur : accès à l'éditeur de niveaux, rien d'autre.

Pratique en ligne de commande ; l'administration (/api/admin/) permet de gérer les mêmes comptes."""

from __future__ import annotations

from getpass import getpass
from typing import Any

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError, CommandParser

from authors import access


class Command(BaseCommand):
    help = "Crée un compte auteur (accès à l'éditeur, sans droits d'administration). Le mot de passe est demandé au clavier."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("username")
        parser.add_argument("--reset", action="store_true", help="Change le mot de passe d'un compte existant")
        parser.add_argument("--admin", action="store_true", help="Compte administrateur : accès à l'administration (/api/admin/) en plus de l'éditeur")

    def handle(self, *args: Any, **options: Any) -> None:
        username: str = options["username"].strip().lower()
        existing = User.objects.filter(username=username).first()
        if existing and not options["reset"]:
            raise CommandError(f"{username} existe déjà (utilise --reset pour changer son mot de passe).")
        if not existing and options["reset"]:
            raise CommandError(f"{username} n'existe pas.")

        password = getpass("Mot de passe : ")
        if password != getpass("Confirmation : "):
            raise CommandError("Les mots de passe ne correspondent pas.")
        try:
            validate_password(password)
        except ValidationError as error:
            raise CommandError(" ".join(error.messages)) from error

        user = existing or User(username=username)
        # is_staff ouvre l'administration : réservé aux responsables (option --admin).
        # --admin élève ; changer seulement un mot de passe (--reset) ne retire jamais de droits existants.
        if options["admin"] or not existing:
            user.is_staff = bool(options["admin"])
            user.is_superuser = bool(options["admin"])
        user.is_active = True
        user.set_password(password)
        user.save()
        access.grant(user)
        self.stdout.write(self.style.SUCCESS(f"Compte auteur {username} {'mis à jour' if existing else 'créé'}" + (" (administrateur)." if options["admin"] else ".")))
