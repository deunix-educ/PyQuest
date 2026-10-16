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
import types
from typing import Any, Callable

CELL_FILENAME = "<cell>"

_namespace: dict[str, Any] = {}
# Copie (superficielle) de l'espace de noms avant la dernière exécution normale : point de départ
# des exécutions isolées (tests avec saisies scriptées), qui ne doivent rien modifier.
_baseline: dict[str, Any] = {}
_input_bridge: Callable[[str], str] | None = None


# ---- Module `canvas` : dessin à l'écran -------------------------------------------------------------------
# L'apprenant écrit `import canvas` puis `canvas.line(x1, y1, x2, y2, "red")`. Les traits sont seulement
# enregistrés ici ; l'interface les affiche à la fin de l'exécution et les tests déclaratifs `drawing_*`
# les examinent. Repère : (0, 0) au centre, y vers le haut, de -200 à 200 dans les deux sens.

CANVAS_COLORS = ("black", "red", "green", "blue", "orange", "purple", "gray")
CANVAS_MAX_SEGMENTS = 5000
CANVAS_LIMIT = 200

_segments: list[list[Any]] = []


def _canvas_line(x1: float, y1: float, x2: float, y2: float, color: str = "black") -> None:
    """Trace un trait de (x1, y1) à (x2, y2). Couleurs : black, red, green, blue, orange, purple, gray."""
    coordinates: list[float] = []
    for value in (x1, y1, x2, y2):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError(f"canvas.line attend des nombres, pas {type(value).__name__}")
        if not math.isfinite(value):
            raise ValueError("canvas.line: les coordonnées doivent être des nombres finis")
        coordinates.append(round(float(value), 2))
    if color not in CANVAS_COLORS:
        raise ValueError(f"canvas.line: couleur inconnue {color!r}, choisis parmi {', '.join(CANVAS_COLORS)}")
    if len(_segments) >= CANVAS_MAX_SEGMENTS:
        raise RuntimeError(f"canvas.line: trop de traits (maximum {CANVAS_MAX_SEGMENTS})")
    _segments.append([*coordinates, color])


def _canvas_clear() -> None:
    """Efface tout le dessin."""
    _segments.clear()


canvas_module = types.ModuleType("canvas")
canvas_module.__doc__ = "Dessin PyQuest : canvas.line(x1, y1, x2, y2, color) et canvas.clear()."
setattr(canvas_module, "line", _canvas_line)
setattr(canvas_module, "clear", _canvas_clear)
setattr(canvas_module, "COLORS", CANVAS_COLORS)
setattr(canvas_module, "LIMIT", CANVAS_LIMIT)
sys.modules["canvas"] = canvas_module


def reset_namespace() -> None:
    """Repart d'un espace de noms vierge (changement de niveau, bouton « Recommencer »)."""
    _namespace.clear()
    _namespace["__name__"] = "__main__"
    _baseline.clear()
    _baseline.update(_namespace)
    _segments.clear()


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
    """Exécute `code` et renvoie un JSON : {ok, error, variables, drawing}.

    `collect_json` est une liste JSON de noms de variables à relire après l'exécution.
    Si `isolated`, le code s'exécute sur une copie de l'état d'avant la dernière exécution et
    l'espace de noms de l'apprenant n'est pas modifié (utilisé pour valider avec des saisies
    scriptées).
    """
    global _baseline
    collect: list[str] = json.loads(collect_json)
    # Chaque exécution repart d'une feuille vierge : relancer une cellule ne superpose pas les dessins.
    _segments.clear()
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
    return json.dumps({"ok": error is None, "error": error, "variables": variables, "drawing": list(_segments)})


reset_namespace()
