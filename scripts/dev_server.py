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
FORWARDED_HEADERS = ("Authorization", "Content-Type", "Accept", "Accept-Language", "Cookie", "Origin", "Referer", "Host")
RETURNED_HEADERS = ("Content-Type", "Location", "Cache-Control", "Vary")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Les redirections (connexion, déconnexion) sont renvoyées telles quelles au navigateur."""

    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


class DevHandler(SimpleHTTPRequestHandler):
    def _proxy_api(self) -> None:
        assert API_UPSTREAM is not None
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {name: value for name in FORWARDED_HEADERS if (value := self.headers.get(name))}
        request = urllib.request.Request(API_UPSTREAM + self.path, data=body, headers=headers, method=self.command)
        extra: list[tuple[str, str]] = []
        try:
            with _OPENER.open(request, timeout=10) as response:
                status, payload, reply = response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            status, payload, reply = error.code, error.read(), error.headers
        except OSError:
            status, payload, reply = 502, b"Bad gateway", None
        self.send_response(status)
        if reply is not None:
            extra = [(name, value) for name in RETURNED_HEADERS if (value := reply.get(name))]
            extra += [("Set-Cookie", cookie) for cookie in reply.get_all("Set-Cookie") or []]
        else:
            extra = [("Content-Type", "text/plain")]
        for name, value in extra:
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _is_api(self) -> bool:
        return API_UPSTREAM is not None and self.path.startswith("/api/")

    def do_GET(self) -> None:
        self._proxy_api() if self._is_api() else super().do_GET()

    def do_HEAD(self) -> None:
        self._proxy_api() if self._is_api() else super().do_HEAD()

    def do_POST(self) -> None:
        self._proxy_api() if self._is_api() else self.send_error(405)

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
