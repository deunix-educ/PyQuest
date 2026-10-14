from django.db import models


class SyncProfile(models.Model):
    """Progression synchronisée d'un apprenant, identifiée par un jeton secret (jamais stocké en clair)."""

    token_hash = models.CharField(max_length=64, unique=True)
    payload = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"SyncProfile({self.token_hash[:8]}…)"
