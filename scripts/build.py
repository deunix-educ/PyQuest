#!/usr/bin/env python3
"""Construit dist/ : app + niveaux + Pyodide, avec liste de pré-cache du service worker à jour."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
PRECACHED_SUFFIXES = {".html", ".css", ".js", ".mjs", ".json", ".svg", ".png", ".woff2", ".webmanifest", ".py"}
NOT_PRECACHED = {"service-worker.js"}


def is_author_tool(relative: str) -> bool:
    """Fichiers propres à l'éditeur de niveaux et documentation en ligne (/docs/) : sur un serveur ils peuvent être
    protégés par authentification, donc jamais pré-cachés (le service worker les récupérerait sans session et mettrait une page de connexion en cache)."""
    return (
        relative.startswith("docs/")
        or relative == "author.html"
        or relative == "css/author.css"
        or relative.startswith("js/author/")
        or (relative.startswith("js/i18n/author.") and relative.endswith(".json"))
    )


def copy_tree(source: Path, target: Path) -> None:
    shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.md"))


def shell_files() -> list[str]:
    """Fichiers de l'app à pré-cacher (chemins relatifs à la racine du site)."""
    files = [
        path.relative_to(DIST).as_posix()
        for path in sorted(DIST.rglob("*"))
        if path.is_file()
        and path.suffix in PRECACHED_SUFFIXES
        and path.name not in NOT_PRECACHED
        and not path.relative_to(DIST).parts[0] in {"vendor", "levels"}
        and not is_author_tool(path.relative_to(DIST).as_posix())
    ]
    return ["./", *files]


def content_hash(paths: list[str]) -> str:
    digest = hashlib.sha256()
    for relative in paths:
        if relative != "./":
            digest.update((DIST / relative).read_bytes())
    return digest.hexdigest()[:12]


def main() -> int:
    # --docs DOSSIER : documentation déjà générée (mkdocs build), copiée dans dist/docs/ (non pré-cachée).
    docs: Path | None = None
    if "--docs" in sys.argv:
        index = sys.argv.index("--docs")
        docs = Path(sys.argv[index + 1]) if index + 1 < len(sys.argv) else None
        if docs is None or not (docs / "index.html").is_file():
            print("--docs : dossier de documentation générée introuvable (make docs).", file=sys.stderr)
            return 1
    pyodide = ROOT / "vendor" / "pyodide"
    if not pyodide.exists():
        print("vendor/pyodide absent : lancez `make vendor-pyodide` d'abord.", file=sys.stderr)
        return 1

    if DIST.exists():
        shutil.rmtree(DIST)
    copy_tree(ROOT / "app", DIST)
    copy_tree(ROOT / "levels", DIST / "levels")
    shutil.copytree(pyodide, DIST / "vendor" / "pyodide")
    if docs is not None:
        shutil.copytree(docs, DIST / "docs")

    precache = shell_files()
    worker = DIST / "service-worker.js"
    source = worker.read_text(encoding="utf-8")
    pyodide_version = (pyodide / ".version").read_text(encoding="utf-8").strip() if (pyodide / ".version").exists() else "dev"
    source = re.sub(r"const PYODIDE_CACHE = '[^']*';", f"const PYODIDE_CACHE = 'pyquest-pyodide-{pyodide_version}';", source)
    source, shell_count = re.subn(r"const SHELL = \[.*?\];", f"const SHELL = {json.dumps(precache)};", source, flags=re.S)
    source, version_count = re.subn(
        r"const CACHE_VERSION = '[^']*';", f"const CACHE_VERSION = 'pyquest-{content_hash(precache)}';", source
    )
    if shell_count != 1 or version_count != 1:
        print("service-worker.js : motifs SHELL/CACHE_VERSION introuvables.", file=sys.stderr)
        return 1
    worker.write_text(source, encoding="utf-8")
    print(f"dist/ prêt : {len(precache)} fichiers pré-cachés.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
