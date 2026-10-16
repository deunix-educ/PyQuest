"""Vecteurs communs avec tests/js/speech-key.test.mjs : les deux implémentations doivent concorder."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from voice_key import speech_key, speech_text  # noqa: E402


class VoiceKeyTest(unittest.TestCase):
    def test_text_is_normalised(self) -> None:
        self.assertEqual(speech_text("  Un `print()`   affiche\n du texte. "), "Un print() affiche du texte.")

    def test_vectors_match_javascript(self) -> None:
        self.assertEqual(speech_key("fr", "Un `print()` affiche  du texte."), "0933ff041539352b")
        self.assertEqual(speech_key("en", "Héllo wörld"), "87e2e25e5123e565")
        self.assertEqual(speech_key("fr", ""), "dc8d3218feba4761")

    def test_language_changes_key(self) -> None:
        self.assertNotEqual(speech_key("fr", "Bonjour"), speech_key("en", "Bonjour"))


if __name__ == "__main__":
    unittest.main()
