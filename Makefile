PYTHONPATH=services/pipeline/src

.PHONY: bootstrap test taxonomy sources discover coverage expansion audit enrich promote fetch refresh parse analyze persist-db migrate sync-db browser-install vercel-pull-preview vercel-pull-prod build-prod migrate-prod sync-prod-db persist-prod deploy-preview deploy-prod

bootstrap:
	./scripts/bootstrap.sh

test:
	cd services/pipeline && . .venv/bin/activate && pytest

taxonomy:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli validate-taxonomy

sources:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli validate-sources

discover:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli discover-source-candidates --refresh

coverage:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli report-source-coverage

expansion:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli report-source-expansion-plan

audit:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli report-source-quality-audit

enrich:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli enrich-source-candidates --refresh

promote:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli promote-source-families

fetch:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli fetch-seed-documents

refresh:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli refresh-sources

browser-install:
	cd services/pipeline && . .venv/bin/activate && python -m playwright install chromium

vercel-pull-preview:
	cd apps/web && npx vercel env pull .vercel/.env.preview.local --environment=preview --yes

vercel-pull-prod:
	cd apps/web && npx vercel env pull .vercel/.env.production.local --environment=production --yes

build-prod:
	./scripts/run-with-vercel-env.sh production bash -lc 'cd apps/web && npm run build'

parse:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli parse-raw-documents

analyze:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli analyze-documents

persist-db:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli persist-analysis-artifacts

migrate:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli migrate-db

sync-db:
	cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli sync-db-to-source-manifests --reset-jurisdiction-analyses

migrate-prod:
	./scripts/run-with-vercel-env.sh production bash -lc 'cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli migrate-db'

sync-prod-db:
	./scripts/run-with-vercel-env.sh production bash -lc 'cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli sync-db-to-source-manifests --reset-jurisdiction-analyses'

persist-prod:
	./scripts/run-with-vercel-env.sh production bash -lc 'cd services/pipeline && . .venv/bin/activate && PYTHONPATH=src python -m observatory.cli persist-analysis-artifacts'

deploy-preview:
	cd apps/web && npx vercel deploy --yes

deploy-prod:
	cd apps/web && npx vercel deploy --prod --yes
