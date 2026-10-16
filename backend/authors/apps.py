from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _create_group(sender: object, **kwargs: object) -> None:
    from django.contrib.auth.management import create_permissions

    from .access import authors_group

    # Les permissions sont créées par un autre gestionnaire de post_migrate : on s'assure qu'elles existent d'abord.
    create_permissions(sender, verbosity=0)  # type: ignore[arg-type]
    authors_group()


class AuthorsConfig(AppConfig):
    name = "authors"
    verbose_name = "Éditeur de niveaux"

    def ready(self) -> None:
        post_migrate.connect(_create_group, sender=self)
