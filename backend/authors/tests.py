from io import StringIO
from typing import Any
from unittest import mock

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client, TestCase, override_settings

# Réponse du client de test Django : type exact non exposé par les stubs.
_Response = Any

PASSWORD = "un-mot-de-passe-solide-42"
LOGIN = "/api/auth/login/"
CHECK = "/api/auth/check/"


def make_user(username: str = "ada", *, staff: bool = True, password: str = PASSWORD) -> User:
    return User.objects.create_user(username=username, password=password, is_staff=staff)  # pyright: ignore[reportAttributeAccessIssue]


class LoginTest(TestCase):
    def post(self, username: str, password: str, client: Client | None = None, **extra: str) -> _Response:
        return (client or self.client).post(LOGIN, {"username": username, "password": password, **extra})

    def test_login_page_is_a_real_form(self) -> None:
        response = self.client.get(LOGIN)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'name="password"')
        self.assertContains(response, "csrfmiddlewaretoken")
        self.assertContains(response, 'lang="fr"')
        self.assertEqual(self.client.get(LOGIN, headers={"Accept-Language": "en-US"}).context["lang"], "en")
        self.assertIn("no-store", response.headers["Cache-Control"])

    def test_staff_can_sign_in_and_is_sent_to_the_editor(self) -> None:
        make_user()
        response = self.post("Ada", PASSWORD)  # identifiant insensible à la casse
        self.assertRedirects(response, "/author.html", fetch_redirect_response=False)
        self.assertEqual(self.client.get(CHECK).status_code, 204)

    def test_wrong_password_and_unknown_user_look_the_same(self) -> None:
        make_user()
        wrong = self.post("ada", "mauvais")
        unknown = self.post("inconnu", "mauvais")
        self.assertContains(wrong, "incorrect")
        self.assertEqual(wrong.content.decode().count("incorrect"), unknown.content.decode().count("incorrect"))
        self.assertEqual(self.client.get(CHECK).status_code, 401)

    def test_non_staff_account_is_refused_even_with_the_right_password(self) -> None:
        make_user("lea", staff=False)
        self.assertContains(self.post("lea", PASSWORD), "incorrect")
        self.assertEqual(self.client.get(CHECK).status_code, 401)

    def test_inactive_account_is_refused(self) -> None:
        user = make_user()
        user.is_active = False
        user.save()
        self.assertContains(self.post("ada", PASSWORD), "incorrect")

    def test_next_is_only_followed_for_local_paths(self) -> None:
        make_user()
        for hostile in ("https://evil.example/x", "//evil.example/x", "javascript:alert(1)", "http://testserver.evil/x"):
            client = Client()
            response = self.post("ada", PASSWORD, client, next=hostile)
            self.assertRedirects(response, "/author.html", fetch_redirect_response=False, msg_prefix=hostile)
        response = self.post("ada", PASSWORD, Client(), next="/js/author/main.js")
        self.assertRedirects(response, "/js/author/main.js", fetch_redirect_response=False)

    def test_csrf_is_enforced_on_login(self) -> None:
        make_user()
        strict = Client(enforce_csrf_checks=True)
        self.assertEqual(self.post("ada", PASSWORD, strict).status_code, 403)

    def test_lockout_after_repeated_failures_even_for_the_right_password(self) -> None:
        make_user()
        for _ in range(5):
            self.assertEqual(self.post("ada", "mauvais").status_code, 200)
        locked = self.post("ada", PASSWORD)
        self.assertEqual(locked.status_code, 429)
        self.assertEqual(self.client.get(CHECK).status_code, 401)

    def test_lockout_expires(self) -> None:
        from datetime import timedelta

        from django.utils import timezone

        from .models import LoginFailure

        make_user()
        for _ in range(5):
            self.post("ada", "mauvais")
        LoginFailure.objects.update(created_at=timezone.now() - timedelta(minutes=16))
        self.assertEqual(self.post("ada", PASSWORD).status_code, 302)

    def test_failures_are_cleared_by_a_success(self) -> None:
        from .models import LoginFailure

        make_user()
        for _ in range(3):
            self.post("ada", "mauvais")
        self.post("ada", PASSWORD)
        self.assertEqual(LoginFailure.objects.filter(username="ada").count(), 0)

    def test_ip_lockout_uses_real_ip_header_only_when_trusted(self) -> None:
        from .models import LoginFailure

        make_user()
        with override_settings(TRUST_REAL_IP_HEADER=False):
            self.client.post(LOGIN, {"username": "x", "password": "y"}, headers={"X-Real-IP": "203.0.113.9"})
        with override_settings(TRUST_REAL_IP_HEADER=True):
            self.client.post(LOGIN, {"username": "x", "password": "y"}, headers={"X-Real-IP": "203.0.113.9"})
        self.assertEqual(sorted(LoginFailure.objects.values_list("ip", flat=True)), ["127.0.0.1", "203.0.113.9"])

    def test_ip_lockout_blocks_many_usernames(self) -> None:
        make_user()
        for index in range(20):
            self.post(f"inconnu{index}", "mauvais")
        self.assertEqual(self.post("ada", PASSWORD).status_code, 429)


class CheckAndLogoutTest(TestCase):
    def test_check_requires_an_author_session(self) -> None:
        self.assertEqual(self.client.get(CHECK).status_code, 401)
        make_user("lea", staff=False)
        self.client.login(username="lea", password=PASSWORD)
        self.assertEqual(self.client.get(CHECK).status_code, 401)
        make_user("ada")
        self.client.login(username="ada", password=PASSWORD)
        response = self.client.get(CHECK)
        self.assertEqual(response.status_code, 204)
        self.assertIn("no-store", response.headers["Cache-Control"])

    def test_check_refuses_other_methods(self) -> None:
        self.assertEqual(self.client.post(CHECK).status_code, 405)

    def test_logout_ends_the_session_and_needs_post(self) -> None:
        make_user()
        self.client.login(username="ada", password=PASSWORD)
        self.assertEqual(self.client.get("/api/auth/logout/").status_code, 405)
        self.assertEqual(self.client.get(CHECK).status_code, 204)
        response = self.client.post("/api/auth/logout/")
        self.assertRedirects(response, LOGIN, fetch_redirect_response=False)
        self.assertEqual(self.client.get(CHECK).status_code, 401)

    def test_signed_in_visitor_sees_open_and_logout(self) -> None:
        make_user()
        self.client.login(username="ada", password=PASSWORD)
        page = self.client.get(LOGIN)
        self.assertContains(page, "Connecté en tant que ada")
        self.assertContains(page, "/api/auth/logout/")

    def test_session_cookie_is_http_only(self) -> None:
        make_user()
        response = self.client.post(LOGIN, {"username": "ada", "password": PASSWORD})
        cookie = response.cookies["pyquest_author"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")


class CreateAuthorCommandTest(TestCase):
    def run_command(self, *args: str, passwords: tuple[str, str] = (PASSWORD, PASSWORD)) -> str:
        out = StringIO()
        with mock.patch("authors.management.commands.create_author.getpass", side_effect=list(passwords)):
            call_command("create_author", *args, stdout=out)
        return out.getvalue()

    def test_creates_a_staff_account_without_admin_rights(self) -> None:
        self.run_command("Ada")
        user = User.objects.get(username="ada")
        self.assertTrue(user.is_staff and user.is_active)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertEqual(self.client.post(LOGIN, {"username": "ada", "password": PASSWORD}).status_code, 302)

    def test_rejects_weak_or_mismatched_passwords(self) -> None:
        with self.assertRaises(CommandError):
            self.run_command("ada", passwords=("court", "court"))
        with self.assertRaises(CommandError):
            self.run_command("ada", passwords=(PASSWORD, "autre-chose-42-xx"))
        self.assertFalse(User.objects.filter(username="ada").exists())

    def test_existing_account_needs_reset(self) -> None:
        make_user()
        with self.assertRaises(CommandError):
            self.run_command("ada")
        self.run_command("ada", "--reset", passwords=("nouveau-mot-de-passe-77", "nouveau-mot-de-passe-77"))
        self.assertTrue(User.objects.get(username="ada").check_password("nouveau-mot-de-passe-77"))
        with self.assertRaises(CommandError):
            self.run_command("inconnu", "--reset")
