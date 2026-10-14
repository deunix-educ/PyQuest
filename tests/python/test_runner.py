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


if __name__ == "__main__":
    unittest.main()
