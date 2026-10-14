#!/usr/bin/env python3
"""Valide les niveaux : schéma JSON, cohérence du manifeste, traductions et code de départ."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import jsonschema
import yaml

ROOT = Path(__file__).resolve().parent.parent
LEVELS_DIR = ROOT / "levels"
SCHEMA_PATH = LEVELS_DIR / "schema" / "level.schema.json"


def missing_english(node: Any, path: str = "") -> list[str]:
    """Liste les chemins où une chaîne i18n {fr: ...} n'a pas de traduction `en`."""
    problems: list[str] = []
    if isinstance(node, dict):
        if "fr" in node and isinstance(node["fr"], (str, list)):
            if "en" not in node:
                problems.append(path or "<root>")
        for key, value in node.items():
            problems.extend(missing_english(value, f"{path}.{key}" if path else str(key)))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            problems.extend(missing_english(value, f"{path}[{index}]"))
    return problems


def code_snippets(level: dict[str, Any]) -> list[tuple[str, str]]:
    """Extrait (chemin, code) pour chaque starter/solution du niveau."""
    snippets: list[tuple[str, str]] = []
    for index, step in enumerate(level.get("steps", [])):
        for field in ("starter", "solution"):
            if isinstance(step.get(field), str):
                snippets.append((f"steps[{index}].{field}", step[field]))
    starter = level.get("mission", {}).get("starter")
    if isinstance(starter, str):
        snippets.append(("mission.starter", starter))
    return snippets


def validate_level(path: Path, schema: dict[str, Any], require_en: bool) -> list[str]:
    errors: list[str] = []
    try:
        level = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        return [f"YAML invalide : {exc}"]

    validator = jsonschema.Draft202012Validator(schema)
    for error in sorted(validator.iter_errors(level), key=lambda e: list(e.absolute_path)):
        location = ".".join(str(part) for part in error.absolute_path) or "<root>"
        errors.append(f"schéma : {location} : {error.message}")
    if errors:
        return errors

    if level["id"] != path.parent.name:
        errors.append(f"id '{level['id']}' différent du dossier '{path.parent.name}'")
    if require_en:
        errors.extend(f"traduction `en` manquante : {where}" for where in missing_english(level))
    for where, code in code_snippets(level):
        try:
            compile(code, where, "exec")
        except SyntaxError as exc:
            errors.append(f"{where} : le code ne compile pas ({exc.msg}, ligne {exc.lineno})")
    return errors


def validate_manifest(known_ids: set[str]) -> list[str]:
    manifest = json.loads((LEVELS_DIR / "manifest.json").read_text(encoding="utf-8"))
    errors: list[str] = []
    listed = [entry["id"] for entry in manifest["levels"]]
    for level_id in listed:
        if level_id not in known_ids:
            errors.append(f"manifest : '{level_id}' n'a pas de level.yaml")
    for level_id in sorted(known_ids - set(listed)):
        errors.append(f"manifest : '{level_id}' existe mais n'est pas référencé")
    for entry in manifest["levels"]:
        for required in entry.get("requires", []):
            if required not in listed:
                errors.append(f"manifest : '{entry['id']}' requiert '{required}' inconnu")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-missing-en", action="store_true", help="n'exige pas les traductions en")
    args = parser.parse_args()

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator.check_schema(schema)

    files = sorted(LEVELS_DIR.glob("*/level.yaml"))
    failed = False
    for path in files:
        errors = validate_level(path, schema, require_en=not args.allow_missing_en)
        status = "OK " if not errors else "KO "
        print(f"{status} {path.parent.name}")
        for message in errors:
            print(f"      - {message}")
        failed = failed or bool(errors)

    for message in validate_manifest({path.parent.name for path in files}):
        print(f"KO  {message}")
        failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
