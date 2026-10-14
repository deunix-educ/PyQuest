#!/usr/bin/env python3
"""Serveur de développement : sert app/ à la racine, plus /levels/ et /vendor/ du dépôt.

Ajoute les en-têtes COOP/COEP/CORP exigés par le SharedArrayBuffer (interruption de Pyodide).
"""

from __future__ import annotations

import argparse
import mimetypes
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
MOUNTS = {"/levels/": ROOT / "levels", "/vendor/": ROOT / "vendor"}

mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("application/wasm", ".wasm")


class DevHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        clean = path.split("?", 1)[0].split("#", 1)[0]
        base, relative = APP_DIR, clean.lstrip("/")
        for prefix, directory in MOUNTS.items():
            if clean.startswith(prefix):
                base, relative = directory, clean[len(prefix):]
                break
        target = (base / relative).resolve()
        # Refuse toute sortie du dossier servi (../).
        if base.resolve() not in (target, *target.parents):
            return str(base / "__forbidden__")
        return str(target)

    def end_headers(self) -> None:
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        if os.environ.get("PYQUEST_QUIET") != "1":
            super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), DevHandler)
    print(f"PyQuest dev server: http://{args.host}:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
