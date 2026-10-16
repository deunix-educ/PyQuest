import json
from typing import Any

from django.test import TestCase

# Réponse du client de test Django (HttpResponse enrichi) : type exact non exposé par les stubs.
_Response = Any

TOKEN = "a" * 40
URL = "/api/sync/"
PAYLOAD = {"version": 1, "completedLevels": {}, "badges": {}, "streak": {"current": 0, "best": 0, "lastDay": None}}


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class SyncApiTest(TestCase):
    def put(self, body: object, token: str = TOKEN) -> _Response:
        return self.client.put(URL, data=json.dumps(body), content_type="application/json", headers=bearer(token))

    def test_requires_token(self) -> None:
        self.assertEqual(self.client.get(URL).status_code, 401)
        self.assertEqual(self.client.get(URL, headers=bearer("short")).status_code, 401)

    def test_unknown_token_is_404(self) -> None:
        self.assertEqual(self.client.get(URL, headers=bearer(TOKEN)).status_code, 404)

    def test_roundtrip_and_overwrite(self) -> None:
        self.assertEqual(self.put({"payload": PAYLOAD}).status_code, 200)
        newer = {**PAYLOAD, "badges": {"first_level": "2026-10-14T10:00:00Z"}}
        self.assertEqual(self.put({"payload": newer}).status_code, 200)
        response = self.client.get(URL, headers=bearer(TOKEN))
        self.assertEqual(response.json()["payload"], newer)

    def test_tokens_are_isolated(self) -> None:
        self.put({"payload": PAYLOAD})
        self.assertEqual(self.client.get(URL, headers=bearer("b" * 40)).status_code, 404)

    def test_rejects_bad_payloads(self) -> None:
        self.assertEqual(self.put({"payload": {"no": "version"}}).status_code, 400)
        self.assertEqual(self.put([1, 2]).status_code, 400)
        response = self.client.put(URL, data="nope", content_type="application/json", headers=bearer(TOKEN))
        self.assertEqual(response.status_code, 400)

    def test_rejects_oversized_payload(self) -> None:
        big = {"payload": {"version": 1, "blob": "x" * (300 * 1024)}}
        self.assertEqual(self.put(big).status_code, 400)

    def test_optimistic_concurrency(self) -> None:
        first = self.put({"payload": PAYLOAD}).json()["updated_at"]
        # Mise à jour avec la bonne base : acceptée.
        second = self.put({"payload": PAYLOAD, "base": first}).json()["updated_at"]
        # Base périmée (un autre appareil est passé entre-temps) : 409 avec l'état courant.
        stale = self.put({"payload": {**PAYLOAD, "badges": {"x": "y"}}, "base": first})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["updated_at"], second)
        self.assertEqual(stale.json()["payload"], PAYLOAD)
        self.assertEqual(self.put({"payload": PAYLOAD, "base": 12}).status_code, 400)

    def test_delete_erases_data(self) -> None:
        self.put({"payload": PAYLOAD})
        self.assertEqual(self.client.delete(URL, headers=bearer(TOKEN)).status_code, 204)
        self.assertEqual(self.client.get(URL, headers=bearer(TOKEN)).status_code, 404)
        # Idempotent, et exige toujours un jeton valide.
        self.assertEqual(self.client.delete(URL, headers=bearer(TOKEN)).status_code, 204)
        self.assertEqual(self.client.delete(URL).status_code, 401)
