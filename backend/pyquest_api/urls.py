from django.urls import include, path

urlpatterns = [
    path("api/sync/", include("sync.urls")),
]
