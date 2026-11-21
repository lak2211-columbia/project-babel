ifeq ($(OS),Windows_NT)
  PIPELINE_PYTHON := $(if $(wildcard services/pipeline/.venv/Scripts/python.exe),services/pipeline/.venv/Scripts/python.exe,python)
else
  PIPELINE_PYTHON := $(if $(wildcard services/pipeline/.venv/bin/python),services/pipeline/.venv/bin/python,python3)
endif

export PYTHONPATH := services/pipeline/src
RUN_PIPELINE := $(PIPELINE_PYTHON) -m observatory.cli

.PHONY: bootstrap test taxonomy sources validate-artifacts discover coverage expansion audit enrich promote fetch refresh parse analyze analyze-jurisdictions grounding persist-db migrate sync-db sync-db-dry-run browser-install vercel-pull-preview vercel-pull-prod build-prod migrate-prod sync-prod-db persist-prod deploy-preview deploy-prod

bootstrap:
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1
else
	./scripts/bootstrap.sh
endif

test:
	$(PIPELINE_PYTHON) -m pytest -c services/pipeline/pyproject.toml services/pipeline/tests

taxonomy:
	$(RUN_PIPELINE) validate-taxonomy

sources:
	$(RUN_PIPELINE) validate-sources

validate-artifacts:
	$(RUN_PIPELINE) validate-artifacts

discover:
	$(RUN_PIPELINE) discover-source-candidates --refresh

coverage:
	$(RUN_PIPELINE) report-source-coverage

expansion:
	$(RUN_PIPELINE) report-source-expansion-plan

audit:
	$(RUN_PIPELINE) report-source-quality-audit

enrich:
	$(RUN_PIPELINE) enrich-source-candidates --refresh

promote:
	$(RUN_PIPELINE) promote-source-families

fetch:
	$(RUN_PIPELINE) fetch-seed-documents

refresh:
	$(RUN_PIPELINE) refresh-sources

browser-install:
	$(PIPELINE_PYTHON) -m playwright install chromium

vercel-pull-preview:
	cd apps/web && npx vercel env pull .vercel/.env.preview.local --environment=preview --yes

vercel-pull-prod:
	cd apps/web && npx vercel env pull .vercel/.env.production.local --environment=production --yes

build-prod:
	./scripts/run-with-vercel-env.sh production bash -lc 'cd apps/web && npm run build'

parse:
	$(RUN_PIPELINE) parse-raw-documents

analyze:
	$(RUN_PIPELINE) analyze-documents

analyze-jurisdictions:
	$(RUN_PIPELINE) analyze-jurisdictions --refresh-existing

grounding:
	$(RUN_PIPELINE) check-grounding

persist-db:
	$(RUN_PIPELINE) persist-analysis-artifacts

migrate:
	$(RUN_PIPELINE) migrate-db

sync-db-dry-run:
	$(RUN_PIPELINE) sync-db-to-source-manifests --dry-run

sync-db:
	$(RUN_PIPELINE) sync-db-to-source-manifests

migrate-prod:
	./scripts/run-with-vercel-env.sh production $(PIPELINE_PYTHON) -m observatory.cli migrate-db

sync-prod-db:
	./scripts/run-with-vercel-env.sh production $(PIPELINE_PYTHON) -m observatory.cli sync-db-to-source-manifests

persist-prod:
	./scripts/run-with-vercel-env.sh production $(PIPELINE_PYTHON) -m observatory.cli persist-analysis-artifacts

deploy-preview:
	cd apps/web && npx vercel deploy --yes

deploy-prod:
	cd apps/web && npx vercel deploy --prod --yes
