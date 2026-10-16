# PyQuest — tâches courantes. Les recettes doivent être indentées par des tabulations (exigence de make).

PYTHON ?= python3
VENV := .venv
VENV_PY := $(VENV)/bin/python
PORT ?= 8000

.PHONY: help install vendor-pyodide dev validate-levels build dev-sync fetch-nginx dev-nginx dev-admin dev-author docs docs-serve deploy check-deploy test-deploy test test-js test-python test-backend test-e2e typecheck icons voice check-voice ci ci-e2e clean

help: ## Affiche cette aide
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

install: $(VENV)/.installed vendor-pyodide ## Installe les outils de dev et Pyodide

$(VENV)/.installed: requirements-dev.txt
	$(PYTHON) -m venv $(VENV)
	$(VENV_PY) -m pip install --quiet -r requirements-dev.txt
	touch $@

vendor-pyodide: ## Télécharge Pyodide (version épinglée) dans vendor/pyodide
	./scripts/vendor_pyodide.sh

dev: ## Serveur de développement avec en-têtes COOP/COEP (PORT=8000)
	$(PYTHON) scripts/dev_server.py --port $(PORT)

dev-sync: $(VENV)/.installed ## Serveur de dev + backend Django relayé sur /api/ (synchronisation)
	cd backend && DJANGO_SETTINGS_MODULE=pyquest_api.settings.dev ../$(VENV_PY) manage.py migrate --noinput
	@set -e; (cd backend && DJANGO_SETTINGS_MODULE=pyquest_api.settings.dev ../$(VENV_PY) manage.py runserver 8001 --noreload) & \
	pid=$$!; trap "kill $$pid" EXIT INT TERM; \
	$(PYTHON) scripts/dev_server.py --port $(PORT) --api-upstream http://127.0.0.1:8001

deploy: build ## Déploie dist/ sur le VPS (DEPLOY_HOST=utilisateur@hote ; voir scripts/deploy.sh)
	./scripts/deploy.sh

check-deploy: ## Contrôle un site déployé (URL=https://domaine)
	./scripts/check_deploy.sh $(URL)

test-deploy: ## Teste le script de déploiement avec un faux ssh local
	bash tests/deploy/test_deploy.sh

DOCS_VENV := .venv-docs

$(DOCS_VENV)/.installed: requirements-docs.txt
	$(PYTHON) -m venv $(DOCS_VENV)
	$(DOCS_VENV)/bin/pip install --quiet -r requirements-docs.txt
	touch $@

docs: $(DOCS_VENV)/.installed ## Génère la documentation bilingue dans site/ (échoue sur un lien cassé)
	$(DOCS_VENV)/bin/mkdocs build --quiet

docs-serve: $(DOCS_VENV)/.installed ## Documentation en direct sur http://127.0.0.1:8003/
	$(DOCS_VENV)/bin/mkdocs serve --dev-addr 127.0.0.1:8003

fetch-nginx: ## Récupère le binaire nginx dans .local/nginx (Debian/Ubuntu, sans droits root) pour make dev-nginx
	./scripts/fetch_nginx.sh

dev-nginx: $(VENV)/.installed build ## Pile locale réelle : nginx + Django (éditeur protégé, API) sur http://127.0.0.1:8080/
	$(VENV_PY) scripts/local_stack.py

dev-admin: $(VENV)/.installed ## Crée le compte administrateur de l'essai local (gère les auteurs sur /api/admin/)
	cd backend && DJANGO_SETTINGS_MODULE=pyquest_api.settings.dev PYQUEST_DB_PATH=$(CURDIR)/.local/stack/db.sqlite3 ../$(VENV_PY) manage.py createsuperuser

dev-author: $(VENV)/.installed ## Crée directement un compte auteur local (NAME=x, RESET=--reset) ; demande le mot de passe
	cd backend && DJANGO_SETTINGS_MODULE=pyquest_api.settings.dev PYQUEST_DB_PATH=$(CURDIR)/.local/stack/db.sqlite3 ../$(VENV_PY) manage.py create_author $(or $(NAME),$(USER)) $(RESET)

validate-levels: $(VENV)/.installed ## Valide les niveaux (schéma, manifeste, traductions)
	$(VENV_PY) scripts/validate_levels.py

build: $(VENV)/.installed ## Construit dist/ pour la production
	$(VENV_PY) scripts/build.py

test: test-js test-python test-backend test-deploy validate-levels check-voice ## Lance tous les tests

test-js: ## Tests JavaScript (node:test, aucune dépendance)
	node --test tests/js/*.test.mjs

test-python: ## Tests Python du runner
	$(PYTHON) -m unittest discover -s tests/python -v

test-backend: $(VENV)/.installed ## Tests du backend Django (nécessite Django dans .venv)
	$(VENV)/bin/pip install --quiet -r backend/requirements.txt
	cd backend && ../$(VENV_PY) manage.py test

test-e2e: ## Tests bout en bout dans Chromium (CHROMIUM=/chemin/navigateur)
	npm --prefix tests/e2e install --silent
	node --test tests/e2e/*.test.mjs

typecheck: $(VENV)/.installed ## Vérifie les types Python avec pyright
	$(VENV)/bin/pyright

icons: ## Régénère les icônes PNG depuis app/icons/icon.svg (Chromium requis)
	npm --prefix tests/e2e install --silent
	node scripts/render_icons.mjs

voice: ## Génère la narration (Piper → mp3) pour les textes de niveaux ; voir levels/AUDIO-CREDITS.md
	$(PYTHON) -m venv .venv-voice
	.venv-voice/bin/pip install --quiet -r requirements-voice.txt
	cd scripts && ../.venv-voice/bin/python generate_voice.py

check-voice: $(VENV)/.installed ## Vérifie que toute la narration est générée et à jour
	cd scripts && ../$(VENV_PY) generate_voice.py --check

ci: install test typecheck build docs ## Enchaînement d'intégration continue (sans navigateur)

ci-e2e: ci test-e2e ## Intégration continue complète, avec les tests Chromium (CHROMIUM=…)

clean: ## Supprime dist/, caches et environnement virtuel
	rm -rf dist site $(VENV) .venv-voice .venv-docs
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
