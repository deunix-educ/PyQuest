"""Tests du runner de cellules (exécutés avec CPython ; même code que sous Pyodide)."""

from __future__ import annotations

import builtins
import json
import sys
import unittest
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "app" / "python"))

import pyquest_runner as runner  # noqa: E402


def run(code: str, collect: list[str] | None = None) -> dict[str, Any]:
    return json.loads(runner.run_cell(code, json.dumps(collect or [])))


class RunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        runner.reset_namespace()

    def test_variables_are_described(self) -> None:
        result = run("x = 10.0", ["x"])
        self.assertTrue(result["ok"])
        self.assertEqual(result["variables"]["x"], {"type": "float", "repr": "10.0", "value": 10.0})

    def test_namespace_persists_until_reset(self) -> None:
        run("a = 1")
        self.assertEqual(run("b = a + 1", ["b"])["variables"]["b"]["value"], 2)
        runner.reset_namespace()
        self.assertEqual(run("a")["error"]["type"], "NameError")

    def test_runtime_error_has_line_and_clean_traceback(self) -> None:
        error = run("x = 1\n1 / 0")["error"]
        self.assertEqual((error["type"], error["lineno"]), ("ZeroDivisionError", 2))
        self.assertNotIn("run_cell", error["traceback"])

    def test_syntax_error(self) -> None:
        error = run("def f(:\n    pass")["error"]
        self.assertEqual((error["type"], error["lineno"]), ("SyntaxError", 1))

    def test_isolated_run_does_not_touch_namespace(self) -> None:
        run("n = 1")
        isolated = json.loads(runner.run_cell("n = 99", json.dumps(["n"]), True))
        self.assertEqual(isolated["variables"]["n"]["value"], 99)
        self.assertEqual(run("pass", ["n"])["variables"]["n"]["value"], 1)

    def test_input_uses_bridge_and_reports_eof(self) -> None:
        original = builtins.input
        try:
            runner.set_input_bridge(lambda prompt: json.dumps({"status": "ok", "text": "7"}))
            self.assertEqual(run("v = input('?')", ["v"])["variables"]["v"]["value"], "7")
            runner.set_input_bridge(lambda prompt: json.dumps({"status": "eof"}))
            self.assertEqual(run("input()")["error"]["type"], "EOFError")
            runner.set_input_bridge(lambda prompt: json.dumps({"status": "interrupted"}))
            self.assertEqual(run("input()")["error"]["type"], "KeyboardInterrupt")
        finally:
            builtins.input = original

    def test_non_finite_float_has_no_json_value(self) -> None:
        self.assertIsNone(run("x = float('inf')", ["x"])["variables"]["x"]["value"])


class CanvasTest(unittest.TestCase):
    def setUp(self) -> None:
        runner.reset_namespace()

    def test_segments_are_returned_and_rounded(self) -> None:
        result = run("import canvas\ncanvas.line(0, 0, 100.123456, 0, 'red')\ncanvas.line(0, 0, 0, 50)")
        self.assertTrue(result["ok"])
        self.assertEqual(result["drawing"], [[0.0, 0.0, 100.12, 0.0, "red"], [0.0, 0.0, 0.0, 50.0, "black"]])

    def test_each_run_starts_from_a_blank_sheet(self) -> None:
        run("import canvas\ncanvas.line(0, 0, 1, 1)")
        self.assertEqual(len(run("import canvas\ncanvas.line(0, 0, 2, 2)")["drawing"]), 1)

    def test_clear_empties_the_drawing(self) -> None:
        self.assertEqual(run("import canvas\ncanvas.line(0, 0, 1, 1)\ncanvas.clear()")["drawing"], [])

    def test_invalid_arguments_raise_clear_errors(self) -> None:
        self.assertEqual(run("import canvas\ncanvas.line('a', 0, 1, 1)")["error"]["type"], "TypeError")
        self.assertEqual(run("import canvas\ncanvas.line(0, 0, 1, 1, 'pink')")["error"]["type"], "ValueError")
        self.assertEqual(run("import canvas, math\ncanvas.line(0, 0, math.inf, 1)")["error"]["type"], "ValueError")
        self.assertEqual(run("import canvas\ncanvas.line(True, 0, 1, 1)")["error"]["type"], "TypeError")

    def test_segment_limit(self) -> None:
        result = run("import canvas\nfor i in range(6000):\n    canvas.line(0, 0, i, 0)")
        self.assertEqual(result["error"]["type"], "RuntimeError")
        self.assertEqual(len(result["drawing"]), runner.CANVAS_MAX_SEGMENTS)

    def test_isolated_replay_does_not_touch_learner_state(self) -> None:
        run("import canvas\nx = 1\ncanvas.line(0, 0, 1, 1)")
        replay = json.loads(runner.run_cell("import canvas\ncanvas.line(5, 5, 6, 6)", "[]", True))
        self.assertEqual(replay["drawing"], [[5.0, 5.0, 6.0, 6.0, "black"]])


if __name__ == "__main__":
    unittest.main()
