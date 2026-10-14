# PyQuest — tâches courantes. Les recettes doivent être indentées par des tabulations (exigence de make).

PYTHON ?= python3
VENV := .venv
VENV_PY := $(VENV)/bin/python
PORT ?= 8000

.PHONY: help install vendor-pyodide dev validate-levels build test test-js test-python typecheck clean

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

validate-levels: $(VENV)/.installed ## Valide les niveaux (schéma, manifeste, traductions)
	$(VENV_PY) scripts/validate_levels.py

build: $(VENV)/.installed ## Construit dist/ pour la production
	$(VENV_PY) scripts/build.py

test: test-js test-python validate-levels ## Lance tous les tests

test-js: ## Tests JavaScript (node:test, aucune dépendance)
	node --test tests/js/*.test.mjs

test-python: ## Tests Python du runner
	$(PYTHON) -m unittest discover -s tests/python -v

typecheck: $(VENV)/.installed ## Vérifie les types Python avec pyright
	$(VENV)/bin/pyright

clean: ## Supprime dist/, caches et environnement virtuel
	rm -rf dist $(VENV)
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
