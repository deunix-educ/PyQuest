from django.urls import path

from . import views

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("check/", views.check_view, name="check"),
    path("me/", views.me_view, name="me"),
]
