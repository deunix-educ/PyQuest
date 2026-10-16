#!/usr/bin/env python3
"""Pile complète en local, comme en production : nginx (vrais blocs de nginx/pyquest-locations.conf.example)
devant dist/ et le backend Django (SQLite jetable). Permet d'essayer l'éditeur protégé par connexion, la
synchronisation, les en-têtes d'isolation et les types MIME sans VPS.

    make build && python3 scripts/local_stack.py        # http://127.0.0.1:8080/

nginx n'a pas besoin d'être installé en tant que service : seul le binaire est utilisé (variable PYQUEST_NGINX ou
option --nginx), avec des dossiers de travail dans .local/stack/. Rien n'est écrit hors du dépôt.
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path
from types import FrameType

ROOT = Path(__file__).resolve().parent.parent
NGINX_DIR = ROOT / "nginx"

CONF_TEMPLATE = """\
# Généré par scripts/local_stack.py : ne pas éditer (régénéré à chaque lancement).
daemon off;
pid {work}/nginx.pid;
error_log {work}/logs/error.log warn;

events {{
    worker_connections 256;
}}

http {{
    access_log {work}/logs/access.log;
    client_body_temp_path {work}/temp/body;
    proxy_temp_path {work}/temp/proxy;
    fastcgi_temp_path {work}/temp/fastcgi;
    uwsgi_temp_path {work}/temp/uwsgi;
    scgi_temp_path {work}/temp/scgi;

    limit_req_zone $binary_remote_addr zone=pyquest_sync:1m rate=30r/m;
    # Plus large qu'en production pour ne pas gêner les essais répétés.
    limit_req_zone $binary_remote_addr zone=pyquest_login:1m rate=60r/m;

    server {{
        listen 127.0.0.1:{port};
        server_name localhost;
        root {dist};
        index index.html;
        include snippets/pyquest-locations.conf;
    }}
}}
"""


def find_nginx(explicit: str | None) -> str:
    candidate = explicit or os.environ.get("PYQUEST_NGINX") or shutil.which("nginx")
    if not candidate or not Path(candidate).is_file():
        sys.exit(
            "nginx introuvable. Installe-le (sudo apt install nginx) ou récupère seulement le binaire sans droits root :\n"
            "  mkdir -p /tmp/ngx && cd /tmp/ngx && apt-get download nginx && dpkg -x nginx_*.deb root\n"
            "  PYQUEST_NGINX=/tmp/ngx/root/usr/sbin/nginx python3 scripts/local_stack.py"
        )
    return candidate


def prepare(work: Path, port: int, api_port: int) -> Path:
    """Écrit la configuration nginx et copie les parties communes sous leur nom d'installation."""
    dist = ROOT / "dist"
    if not (dist / "index.html").is_file():
        sys.exit("dist/ est absent : lance d'abord « make build ».")
    for sub in ("conf/snippets", "logs", "temp"):
        (work / sub).mkdir(parents=True, exist_ok=True)
    # Même fichier qu'en production ; seul le port de Django (8001 par défaut) est adapté à l'essai.
    locations = (NGINX_DIR / "pyquest-locations.conf.example").read_text(encoding="utf-8")
    (work / "conf/snippets/pyquest-locations.conf").write_text(locations.replace("127.0.0.1:8001", f"127.0.0.1:{api_port}"), encoding="utf-8")
    shutil.copy(NGINX_DIR / "pyquest-author-headers.conf.example", work / "conf/snippets/pyquest-author-headers.conf")
    config = work / "conf/nginx.conf"
    config.write_text(CONF_TEMPLATE.format(work=work, port=port, dist=dist), encoding="utf-8")
    return config


def django_env(work: Path) -> dict[str, str]:
    return {**os.environ, "DJANGO_SETTINGS_MODULE": "pyquest_api.settings.dev", "PYQUEST_DB_PATH": str(work / "db.sqlite3")}


def python_for_backend() -> str:
    venv = ROOT / ".venv/bin/python"
    return str(venv) if venv.is_file() else sys.executable


def has_author(env: dict[str, str]) -> bool:
    code = "from django.contrib.auth.models import User; print(User.objects.filter(is_staff=True).count())"
    result = subprocess.run([python_for_backend(), "manage.py", "shell", "-c", code], cwd=ROOT / "backend", env=env, capture_output=True, text=True)
    return result.returncode == 0 and result.stdout.strip() not in ("", "0")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8080, help="port de nginx (défaut 8080)")
    parser.add_argument("--api-port", type=int, default=8001, help="port de Django (défaut 8001, celui attendu par nginx)")
    parser.add_argument("--workdir", type=Path, default=ROOT / ".local/stack", help="dossier de travail (config, journaux, base)")
    parser.add_argument("--nginx", help="chemin du binaire nginx (sinon variable PYQUEST_NGINX, sinon le PATH)")
    args = parser.parse_args()

    nginx = find_nginx(args.nginx)
    work = args.workdir.resolve()
    config = prepare(work, args.port, args.api_port)
    env = django_env(work)
    python = python_for_backend()

    subprocess.run([python, "manage.py", "migrate", "--noinput", "--verbosity", "0"], cwd=ROOT / "backend", env=env, check=True)
    if not has_author(env):
        if sys.stdin.isatty():
            print("Aucun compte auteur : création d'un compte pour l'essai.")
            subprocess.run([python, "manage.py", "create_author", os.environ.get("USER", "auteur")], cwd=ROOT / "backend", env=env, check=False)
        else:
            print("Aucun compte auteur. Crée-en un : (cd backend && PYQUEST_DB_PATH=%s %s manage.py create_author nom)" % (work / "db.sqlite3", python))

    check = subprocess.run([nginx, "-t", "-p", str(work), "-c", str(config)], capture_output=True, text=True)
    if check.returncode != 0:
        sys.exit("Configuration nginx invalide :\n" + check.stderr)

    django = subprocess.Popen(
        [python, "manage.py", "runserver", str(args.api_port), "--noreload"],
        cwd=ROOT / "backend",
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    server: subprocess.Popen[bytes] | None = None

    def stop(_signal: int, _frame: FrameType | None) -> None:
        if server:
            server.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        print(f"Pile locale : http://127.0.0.1:{args.port}/   (éditeur : /author.html, protégé par connexion)")
        print(f"Journaux : {work}/logs/ — Ctrl+C pour arrêter.")
        server = subprocess.Popen([nginx, "-p", str(work), "-c", str(config)])
        server.wait()
    finally:
        django.terminate()
        django.wait(timeout=10)


if __name__ == "__main__":
    main()
