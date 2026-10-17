# Images PyQuest : « web » (nginx + site statique) et « backend » (Django + gunicorn).
# Contexte de construction : la racine du dépôt (voir docker/compose.*.yaml).
# syntax=docker/dockerfile:1

# ---- Documentation en ligne (mkdocs) : servie sous /docs/ pour les auteurs et les administrateurs -----------------------
FROM python:3.12-slim-bookworm AS docs
WORKDIR /src
COPY requirements-docs.txt .
RUN pip install --no-cache-dir -r requirements-docs.txt
COPY mkdocs.yml .
COPY docs/site docs/site
RUN mkdocs build --quiet --site-dir /site

# ---- Site statique : moteur Python (Pyodide, version épinglée et vérifiée) puis construction de dist/ -------------------
FROM python:3.12-slim-bookworm AS site
RUN apt-get update && apt-get install -y --no-install-recommends curl bzip2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY scripts/vendor_pyodide.sh scripts/
RUN ./scripts/vendor_pyodide.sh
COPY app app
COPY levels levels
COPY scripts/build.py scripts/
COPY --from=docs /site site
RUN python scripts/build.py --docs site

# ---- Serveur web : nginx (>= 1.25.1 pour http2 on) ---------------------------------------------------------------------
FROM nginx:1.27-alpine AS web
RUN apk add --no-cache bash openssl
RUN rm -f /etc/nginx/conf.d/default.conf && mkdir -p /etc/nginx/snippets /etc/nginx/tls /opt/pyquest/nginx /var/www/pyquest/ca /var/www/pyquest/static
# Mêmes extraits que sur un serveur classique ; seul le relais vers Django change (service « backend », adresse
# résolue à l'exécution par le DNS de Docker : un backend recréé n'oblige pas à redémarrer nginx).
COPY nginx/pyquest-locations.conf.example /tmp/locations.conf
RUN sed -e 's#proxy_pass http://127.0.0.1:8001#proxy_pass http://$pq_upstream#' /tmp/locations.conf > /etc/nginx/snippets/pyquest-locations.conf \
    && rm /tmp/locations.conf \
    && grep -q 'pq_upstream' /etc/nginx/snippets/pyquest-locations.conf
COPY nginx/pyquest-author-headers.conf.example /etc/nginx/snippets/pyquest-author-headers.conf
COPY nginx/pyquest.conf.example nginx/pyquest-intranet.conf.example /opt/pyquest/nginx/
COPY deploy/intranet-ca.html /opt/pyquest/intranet-ca.html
COPY scripts/intranet_cert.sh /usr/local/bin/intranet_cert.sh
COPY docker/web/pyquest-tls /usr/local/bin/pyquest-tls
COPY docker/web/40-pyquest.sh /docker-entrypoint.d/40-pyquest.sh
RUN chmod 755 /usr/local/bin/intranet_cert.sh /usr/local/bin/pyquest-tls /docker-entrypoint.d/40-pyquest.sh
COPY --from=site /src/dist /var/www/pyquest/current
EXPOSE 80 443

# ---- Backend : les roues (dont mysqlclient, à compiler) sont construites à part ---------------------------------------
FROM python:3.12-slim-bookworm AS backend-wheels
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config libmariadb-dev \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt backend/requirements-server.txt backend/requirements-prod.txt /req/
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r /req/requirements-prod.txt

FROM python:3.12-slim-bookworm AS backend
RUN apt-get update && apt-get install -y --no-install-recommends libmariadb3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 pyquest \
    && useradd --system --uid 10001 --gid pyquest --no-create-home --shell /usr/sbin/nologin pyquest \
    && mkdir -p /var/www/pyquest/static /var/lib/pyquest \
    && chown pyquest:pyquest /var/www/pyquest/static /var/lib/pyquest
COPY --from=backend-wheels /wheels /wheels
COPY backend/requirements.txt backend/requirements-server.txt backend/requirements-prod.txt /req/
RUN pip install --no-cache-dir --no-index --find-links /wheels -r /req/requirements-prod.txt && rm -rf /wheels /req
COPY backend /app/backend
COPY docker/backend/entrypoint.sh docker/backend/healthcheck.py /app/
RUN chmod 755 /app/entrypoint.sh
WORKDIR /app/backend
ENV DJANGO_SETTINGS_MODULE=pyquest_api.settings.production PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Pas de USER : l'entrée démarre en root pour donner les volumes à pyquest, puis abandonne ses droits (setpriv).
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 CMD ["python", "/app/healthcheck.py"]
ENTRYPOINT ["/app/entrypoint.sh"]
