from django.urls import include, path

from authors.sites import site as admin_site

urlpatterns = [
    path("api/sync/", include("sync.urls")),
    path("api/auth/", include("authors.urls")),
    # Administration des comptes auteurs : sous /api/ pour passer par le même proxy nginx.
    path("api/admin/", admin_site.urls),
]
