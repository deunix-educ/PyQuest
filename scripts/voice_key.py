"""Clé de narration : relie un texte de niveau à son fichier audio.

Doit rester strictement identique à `app/js/core/speechKey.js` (vecteurs de test communs).
"""

from __future__ import annotations

import re

_FNV_OFFSET = 0xCBF29CE484222325
_FNV_PRIME = 0x100000001B3
_MASK = 0xFFFFFFFFFFFFFFFF


def speech_text(text: str) -> str:
    """Texte réellement lu : sans backticks Markdown, espaces normalisés."""
    return re.sub(r"\s+", " ", text.replace("`", "")).strip()


def speech_key(lang: str, text: str) -> str:
    """Empreinte FNV-1a 64 bits (16 hexa) de la langue et du texte lu."""
    value = _FNV_OFFSET
    for byte in f"{lang}\n{speech_text(text)}".encode("utf-8"):
        value = ((value ^ byte) * _FNV_PRIME) & _MASK
    return f"{value:016x}"
