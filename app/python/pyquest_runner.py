"""Exécuteur de cellules PyQuest.

Chargé dans Pyodide par le worker. Compile et exécute le code de l'apprenant dans un espace de
noms persistant (comme un notebook), puis renvoie un résultat structuré sous forme de JSON.
"""

from __future__ import annotations

import builtins
import json
import linecache
import math
import sys
import traceback
from typing import Any, Callable

CELL_FILENAME = "<cell>"

_namespace: dict[str, Any] = {}
# Copie (superficielle) de l'espace de noms avant la dernière exécution normale : point de départ
# des exécutions isolées (tests avec saisies scriptées), qui ne doivent rien modifier.
_baseline: dict[str, Any] = {}
_input_bridge: Callable[[str], str] | None = None


def reset_namespace() -> None:
    """Repart d'un espace de noms vierge (changement de niveau, bouton « Recommencer »)."""
    _namespace.clear()
    _namespace["__name__"] = "__main__"
    _baseline.clear()
    _baseline.update(_namespace)


def set_input_bridge(bridge: Callable[[str], str]) -> None:
    """Branche input() sur le pont JavaScript.

    Le pont reçoit l'invite et renvoie un JSON `{"status": "ok"|"eof"|"interrupted", "text": str}`.
    """
    global _input_bridge
    _input_bridge = bridge
    builtins.input = _input


def _input(prompt: object = "") -> str:
    """Remplace input() : bloque côté JavaScript jusqu'à la réponse de l'apprenant."""
    sys.stdout.write(str(prompt))
    sys.stdout.flush()
    if _input_bridge is None:
        raise EOFError("EOF when reading a line")
    reply = json.loads(_input_bridge(str(prompt)))
    if reply["status"] == "interrupted":
        raise KeyboardInterrupt
    if reply["status"] == "eof":
        raise EOFError("EOF when reading a line")
    return str(reply["text"])


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


def run_cell(code: str, collect_json: str = "[]", isolated: bool = False) -> str:
    """Exécute `code` et renvoie un JSON : {ok, error, variables}.

    `collect_json` est une liste JSON de noms de variables à relire après l'exécution.
    Si `isolated`, le code s'exécute sur une copie de l'état d'avant la dernière exécution et
    l'espace de noms de l'apprenant n'est pas modifié (utilisé pour valider avec des saisies
    scriptées).
    """
    global _baseline
    collect: list[str] = json.loads(collect_json)
    if isolated:
        namespace = dict(_baseline)
    else:
        _baseline = dict(_namespace)
        namespace = _namespace
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
        exec(compiled, namespace)
    except BaseException as exc:  # noqa: BLE001 - KeyboardInterrupt et SystemExit inclus
        error = _error_info(exc, code)

    variables = {
        name: _describe(namespace[name]) for name in collect if name in namespace
    }
    return json.dumps({"ok": error is None, "error": error, "variables": variables})


reset_namespace()
