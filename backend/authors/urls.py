from django.urls import path

from . import views

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("check/", views.check_view, name="check"),
    path("check-docs/", views.check_docs_view, name="check_docs"),
    path("me/", views.me_view, name="me"),
]
