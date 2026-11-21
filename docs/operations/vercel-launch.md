# Vercel Launch & Production Operations Runbook

Production hosting for Project Babel runs on **Vercel** (`apps/web`, Next.js 16 App Router, **Node 22+**) backed by **Neon Postgres**.

## Live environment

- **Production URL:** `https://project-babel.com`
- **Vercel team:** `heeyong-chungs-projects`
- **Vercel project:** `babel-observatory` (`prj_a5gCz3KW6rXMws8ziLN2biLiqvRP`)
- **Linked app directory:** `apps/web` (`engines.node >= 22.18.0`)
- **Authoritative database:** Neon Postgres (connected via Vercel Marketplace integration)

## Production environment variables

Configured in the Vercel project settings (and pulled locally via `make vercel-pull-prod` / `make vercel-pull-preview`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Neon Postgres connection string used by Next.js server routes. |
| `DATABASE_URL_UNPOOLED` | Direct Neon connection string recommended for SQL migrations. |
| `OBSERVATORY_STRICT_DATABASE` | Set to `1` in production so DB failures never silently fall back to local filesystem or `seedData`. |
| `OBSERVATORY_REVALIDATE_SECRET` | Shared secret authorizing `POST /api/revalidate` to purge cached ISR pages and API responses after a database sync. |
| `VERCEL` / `VERCEL_ENV` | Automatically populated by Vercel; triggers strict DB mode and **refuses to serve fake `seedData`** if Neon is empty or `DATABASE_URL` is absent (rendering an explicit *"No observatory data loaded"* state / error). |

---

## Corpus Readiness & Production Cutover Checklist (v2.1.0 Verified)

The committed repository corpus is **100% v2.1.0 ready for Neon cutover** (Section 0 legacy blocker resolved):
- **121 / 121** official documents (`US 29`, `EU 21`, `KR 17`, `JP 34`, `CN 20`; **77** active primary headline instruments), including all 3 recovered South Korean `law.go.kr` statutes, 6 upgraded full PDFs, and 18 late-2026 landmark instruments.
- **121 / 121** parsed cleanly under **Parser `0.3.0`** (`77 pymupdf`, `43 beautifulsoup4`, `1 hwpx_xml`; `0` stub/wiped docs).
- **121 / 121** analyzed homogeneously under **Taxonomy v2.1.0** (`analysis_version: "0.3.0"`, `provider: "gemini"`, `model: "gemini-4-neon"`, `0` legacy rows) with **`2,271 / 2,271` (`100.0%`) exact verbatim grounding** (`0` ungrounded).
- **`133 / 133`** committed artifacts pass `make validate-artifacts` (`0` errors); **`121/121`** docs + **`5/5`** jurisdictions pass strict `allow_legacy=False` persistence bundle checks; `data/eval/gold_set_results.json` is mirrored byte-identically to `apps/web/src/lib/gold-set-results.snapshot.json`.

### Cutover Steps to Production Neon & Vercel

1. **Pre-flight local checks (zero API calls):**
   ```bash
   make taxonomy && make sources && make validate-artifacts && make grounding && make test
   ```
2. **Apply SQL migrations (`001`–`005`), preview manifest sync, and replay all 121 v2.1.0 analyses strictly (`allow_legacy=False`) to Neon:**
   ```bash
   make vercel-pull-prod
   make migrate-prod
   ./scripts/run-with-vercel-env.sh production services/pipeline/.venv/bin/python -m observatory.cli sync-db-to-source-manifests --dry-run
   make sync-prod-db
   make persist-prod
   ```
3. **Verify, build, deploy `apps/web`, and purge the ISR cache:**
   ```bash
   cd apps/web && npm run lint && npx tsc --noEmit && npm test && npm run build
   npm run deploy:prod
   curl -X POST https://project-babel.com/api/revalidate \
     -H "Authorization: Bearer $OBSERVATORY_REVALIDATE_SECRET"
   ```

*(Windows users can set `DATABASE_URL` in PowerShell and run `python -m observatory.cli migrate-db`, `sync-db-to-source-manifests --dry-run`, and `persist-analysis-artifacts` directly from the repo root with `PYTHONPATH=services/pipeline/src`.)*

---

## Caching, CORS & ISR revalidation

- **ISR pages** (`/`, `/matrix`, `/documents`, `/documents/[documentId]`, `/jurisdictions/[slug]`, `/compare`, `/methodology`) use Next.js incremental caching (`revalidate = 3600`, cache tag `"observatory"`).
- **Public GET APIs** (`/api/overview`, `/api/matrix`, `/api/jurisdictions`, `/api/jurisdictions/[slug]`, `/api/documents`, `/api/documents/[documentId]`, `/api/export`) emit `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` and `Access-Control-Allow-Origin: *` (note: CDN edge copies can remain cached for up to 5 minutes + 60s SWR window until expiry even after `POST /api/revalidate` purges the Next.js server cache).
- **`POST /api/revalidate`** verifies `Authorization: Bearer <secret>` or `x-revalidate-secret` via constant-time comparison against `OBSERVATORY_REVALIDATE_SECRET` and calls `revalidateTag("observatory", { expire: 0 })` + `revalidatePath("/", "layout")`.

## Post-deploy smoke verification

Verify HTTP 200 and live data integrity on:

- `https://project-babel.com/` (cyan **`v2.1 verified provenance`** strip with `Gemini 4 Neon`, `Taxonomy v2.1.0`, `100.0%` grounding, `77` active primary / `121` total corpus docs, 2D Decoupling Map, 5×5 matrix, dynamic findings, sequential palette, zero hardcoded `Claude`/`Sonnet` strings)
- `https://project-babel.com/matrix` and `/api/matrix` (rendering `obligation_strength` pills from Neon `mpr.obligation_strength`)
- `https://project-babel.com/jurisdictions/china` (`20` docs) and `/jurisdictions/united-states` (`29` docs)
- `https://project-babel.com/documents`, `/compare?a=united-states&b=china`, `/methodology` (live Starter Gold-Set Benchmark Scorecard: `83.3%` Req F1, `92.9%` Enf F1, `0.706` κ), `/opengraph-image`
- `https://project-babel.com/documents/eu_digital_omnibus_ai_2026`, `/documents/us_eo_14409_advanced_ai_innovation_security_2026`, `/documents/jp_second_basic_ai_plan_2026`, `/documents/cn_tc260_ai_safety_governance_framework_v3_2026`, `/documents/kr_ai_basic_act`
- `https://project-babel.com/api/overview` (`Live Neon database snapshot`, `taxonomyVersion: "2.1.0"`, `legacyCount: 0`, bootstrap CIs, `Cache-Control`, and `Access-Control-Allow-Origin: *`)
- `https://project-babel.com/api/export?format=csv` (UTF-8 BOM + taxonomy keys), `format=json`, and `format=bibtex`
- Confirm `/sandbox` returns `404` and `/robots.txt` + `/sitemap.xml` return `200`

## Operational follow-ups

- Configure permanent `308` redirect from `www.project-babel.com` → `https://project-babel.com` in Vercel Domain settings.
- Schedule periodic `refresh-sources` + `report-source-quality-audit` checks and Neon backup/budget alerts.
