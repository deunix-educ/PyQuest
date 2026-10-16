from django.db import models


class LoginFailure(models.Model):
    """Tentative de connexion échouée : sert à bloquer temporairement les essais répétés (force brute)."""

    username = models.CharField(max_length=150, db_index=True)
    ip = models.CharField(max_length=45, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self) -> str:
        return f"LoginFailure({self.username!r}, {self.ip})"
