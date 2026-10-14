"""Exécuteur de cellules PyQuest.

Chargé dans Pyodide par le worker. Compile et exécute le code de l'apprenant dans un espace de
noms persistant (comme un notebook), puis renvoie un résultat structuré sous forme de JSON.
"""

from __future__ import annotations

import json
import linecache
import math
import traceback
from typing import Any

CELL_FILENAME = "<cell>"

_namespace: dict[str, Any] = {}


def reset_namespace() -> None:
    """Repart d'un espace de noms vierge (changement de niveau, bouton « Recommencer »)."""
    _namespace.clear()
    _namespace["__name__"] = "__main__"


def _describe(value: Any) -> dict[str, Any]:
    """Décrit une valeur : nom du type, repr, et valeur JSON si elle est « simple »."""
    description: dict[str, Any] = {
        "type": type(value).__name__,
        "repr": repr(value),
        "value": None,
    }
    if isinstance(value, float) and not math.isfinite(value):
        return description
    if value is None or isinstance(value, (str, int, float, bool)):
        description["value"] = value
    return description


def _error_info(exc: BaseException, code: str) -> dict[str, Any]:
    """Construit la description d'une erreur sans exposer les cadres internes du runner."""
    # Le premier cadre est celui de run_cell lui-même : on l'écarte.
    tb = exc.__traceback__.tb_next if exc.__traceback__ else None
    lineno: int | None = None
    if isinstance(exc, SyntaxError):
        lineno = exc.lineno
    else:
        for frame in traceback.extract_tb(tb):
            if frame.filename == CELL_FILENAME:
                lineno = frame.lineno
    return {
        "type": type(exc).__name__,
        "message": str(exc),
        "lineno": lineno,
        "traceback": "".join(traceback.format_exception(type(exc), exc, tb)),
    }


def run_cell(code: str, collect_json: str = "[]") -> str:
    """Exécute `code` et renvoie un JSON : {ok, error, variables}.

    `collect_json` est une liste JSON de noms de variables à relire après l'exécution.
    """
    collect: list[str] = json.loads(collect_json)
    error: dict[str, Any] | None = None

    # Permet aux tracebacks d'afficher la ligne de code fautive.
    linecache.cache[CELL_FILENAME] = (
        len(code),
        None,
        code.splitlines(keepends=True),
        CELL_FILENAME,
    )
    try:
        compiled = compile(code, CELL_FILENAME, "exec")
        exec(compiled, _namespace)
    except BaseException as exc:  # noqa: BLE001 - KeyboardInterrupt et SystemExit inclus
        error = _error_info(exc, code)

    variables = {
        name: _describe(_namespace[name]) for name in collect if name in _namespace
    }
    return json.dumps({"ok": error is None, "error": error, "variables": variables})


reset_namespace()
