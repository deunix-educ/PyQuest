from django.db import models


class EditorAccess(models.Model):
    """Porte la permission « utiliser l'éditeur de niveaux » (aucune table : modèle non géré).

    L'accès à l'éditeur se donne depuis l'administration (groupe « Auteurs » ou permission directe) ; le statut
    `is_staff`, lui, ouvre l'administration et est réservé aux responsables du site.
    """

    class Meta:
        managed = False
        default_permissions = ()
        permissions = [("use_editor", "Peut utiliser l'éditeur de niveaux")]


class LoginFailure(models.Model):
    """Tentative de connexion échouée : sert à bloquer temporairement les essais répétés (force brute)."""

    username = models.CharField(max_length=150, db_index=True)
    ip = models.CharField(max_length=45, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self) -> str:
        return f"LoginFailure({self.username!r}, {self.ip})"
