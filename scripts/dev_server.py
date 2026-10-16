#!/usr/bin/env python3
"""Serveur de développement : sert app/ à la racine, plus /levels/ et /vendor/ du dépôt.

Ajoute les en-têtes COOP/COEP/CORP exigés par le SharedArrayBuffer (interruption de Pyodide).
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
MOUNTS = {"/levels/": ROOT / "levels", "/vendor/": ROOT / "vendor"}

mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("application/wasm", ".wasm")


# Amont Django optionnel (--api-upstream) : /api/ est relayé comme le ferait nginx en production.
API_UPSTREAM: str | None = None
FORWARDED_HEADERS = ("Authorization", "Content-Type", "Accept", "Accept-Language")


class DevHandler(SimpleHTTPRequestHandler):
    def _proxy_api(self) -> None:
        assert API_UPSTREAM is not None
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {name: value for name in FORWARDED_HEADERS if (value := self.headers.get(name))}
        request = urllib.request.Request(API_UPSTREAM + self.path, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                status, payload, content_type = response.status, response.read(), response.headers.get("Content-Type")
        except urllib.error.HTTPError as error:
            status, payload, content_type = error.code, error.read(), error.headers.get("Content-Type")
        except OSError:
            status, payload, content_type = 502, b"Bad gateway", "text/plain"
        self.send_response(status)
        if content_type:
            self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _is_api(self) -> bool:
        return API_UPSTREAM is not None and self.path.startswith("/api/")

    def do_GET(self) -> None:
        self._proxy_api() if self._is_api() else super().do_GET()

    def do_HEAD(self) -> None:
        self._proxy_api() if self._is_api() else super().do_HEAD()

    def do_PUT(self) -> None:
        self._proxy_api() if self._is_api() else self.send_error(405)

    def do_DELETE(self) -> None:
        self._proxy_api() if self._is_api() else self.send_error(405)

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
    parser.add_argument("--api-upstream", help="URL d'un backend Django à relayer sur /api/ (ex. http://127.0.0.1:8001)")
    args = parser.parse_args()
    global API_UPSTREAM
    API_UPSTREAM = args.api_upstream.rstrip("/") if args.api_upstream else None
    server = ThreadingHTTPServer((args.host, args.port), DevHandler)
    print(f"PyQuest dev server: http://{args.host}:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
