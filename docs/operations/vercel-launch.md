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

## Corpus Readiness & Production Cutover Checklist (v2.1.0 Verified — Phase 5)

The committed repository corpus is **100% v2.1.0 ready for Neon cutover**:
- **144 / 144** official documents across **61** portals (**138** sovereign: `US 36`, `EU 24`, `KR 20`, `JP 37`, `CN 21` with **91** active primary headline instruments + **6** opt-in U.S. state `subnational_overlay` statutes: CA SB 53, CA AB 2013, CO SB 24-205, CO SB 26-189, TX TRAIGA, NY RAISE; **12** `supersedes_id` amendment lineage chains; window `2017 – Nov 19, 2026`).
- **144 / 144** parsed cleanly under **Parser `0.3.0`** (`93 pymupdf`, `48 beautifulsoup4`, `3 hwpx_xml`; `0` stub/wiped docs; Korean `law.go.kr` `#hisComment`/`.cont_subtit` and CAC nav/footer chrome stripped cleanly).
- **144 / 144** analyzed homogeneously under **Taxonomy v2.1.0** (`analysis_version: "0.3.0"`, `provider: "gemini"`, `model: "gemini-4-neon"`, `0` legacy rows) with **`2,786 / 2,786` (`100.0%`) exact verbatim grounding** (`0` ungrounded).
- **`156 / 156`** committed artifacts pass `make validate-artifacts` (`0` errors) across **9** Draft 2020-12 JSON Schemas; **`144/144`** docs (`subnational_in_meta=6`, `supersedes_in_meta=12`) + **`5/5`** sovereign jurisdictions pass strict `allow_legacy=False` persistence bundle checks; `data/eval/gold_set_results.json` (25-doc blind multilingual `gold_set_v2.json`) is mirrored byte-identically to `apps/web/src/lib/gold-set-results.snapshot.json`.

### Cutover Steps to Production Neon & Vercel

1. **Pre-flight local checks (zero API calls):**
   ```bash
   make taxonomy && make sources && make validate-artifacts && make grounding && make test
   ```
2. **Apply SQL migrations (`001`–`005`), preview manifest sync, and replay all 144 v2.1.0 analyses strictly (`allow_legacy=False`) to Neon:**
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

- **ISR pages** (`/`, `/matrix`, `/clauses`, `/evolution`, `/documents`, `/documents/[documentId]`, `/jurisdictions/[slug]`, `/compare`, `/methodology`) use Next.js incremental caching (`revalidate = 3600`, cache tag `"observatory"`).
- **Public GET APIs** (`/api/overview`, `/api/matrix`, `/api/clauses`, `/api/evolution`, `/api/jurisdictions`, `/api/jurisdictions/[slug]`, `/api/documents`, `/api/documents/[documentId]`, `/api/export`) emit `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` (or `s-maxage=3600` on `/api/clauses`) and `Access-Control-Allow-Origin: *` (note: CDN edge copies can remain cached during the SWR window until expiry even after `POST /api/revalidate` purges the Next.js server cache).
- **`POST /api/revalidate`** verifies `Authorization: Bearer <secret>` or `x-revalidate-secret` via constant-time comparison against `OBSERVATORY_REVALIDATE_SECRET` and calls `revalidateTag("observatory", { expire: 0 })` + `revalidatePath("/", "layout")`.

## Post-deploy smoke verification

Verify HTTP 200 and live data integrity on:

- `https://project-babel.com/` (cyan **`v2.1 verified provenance`** strip with `Gemini 4 Neon`, `Taxonomy v2.1.0`, `100% verified quote grounding (n=138)` in default sovereign mode / `n=144` with `?states=1`, **`91`** active primary sovereign / **`138`** sovereign corpus total + **`+ U.S. State Laws (6)`** opt-in toggle, collision-free 2D Decoupling Map, 5×5 matrix, dynamic findings, sequential palette, zero hardcoded `Claude`/`Sonnet` strings)
- `https://project-babel.com/matrix` and `/api/matrix` (sovereign default vs. `?states=1` with amber state badges and Neon `mpr.obligation_strength` pills)
- `https://project-babel.com/clauses` and `/api/clauses` (`2,786` grounded clauses, `?format=csv` UTF-8 BOM download, `#quote-*` deep links)
- `https://project-babel.com/evolution` and `/api/evolution` (`2019–2026` trajectories including EU `2020`/`2021` baselines + `12` `supersedes_id` amendment diffs)
- `https://project-babel.com/jurisdictions/china` (`21` docs) and `/jurisdictions/united-states` (`36` federal sovereign, `42` with `?states=1`)
- `https://project-babel.com/documents`, `/compare?a=united-states&b=china`, `/methodology` (live 25-Doc Blind Stratified Multilingual Gold-Set v2 Scorecard: `89.9%` Req F1, `95.4%` Enf F1, `0.747` κ, `0.748` α, 5-country table + `#freshness` ledger), `/opengraph-image`
- `https://project-babel.com/documents/kr_ai_basic_act` (starts directly on `제1조(목적)`, zero boilerplate, humanized prose), `/documents/us_ca_sb_53_tfaia_2025`, `/documents/us_bis_remote_access_semiconductors_2026`, `/documents/eu_digital_omnibus_ai_regulation_2026_1744`, `/documents/jp_second_basic_ai_plan_2026`, `/documents/cn_tc260_ai_safety_governance_framework_3_0_2026`
- `https://project-babel.com/api/overview` (`Live Neon database snapshot`, `taxonomyVersion: "2.1.0"`, `legacyCount: 0`, `includeSubnational: false`, `subnationalCount: 6`, `meanGroundingRatio: 1`, bootstrap CIs, `Cache-Control`, and `Access-Control-Allow-Origin: *`)
- `https://project-babel.com/api/export?format=csv` (UTF-8 BOM + `145` lines + `1.000` grounding), `format=json`, and `format=bibtex`
- Confirm `/sandbox` returns `404` and `/robots.txt` + `/sitemap.xml` (including `/clauses` & `/evolution`) return `200`

## Operational follow-ups

- Configure permanent `308` redirect from `www.project-babel.com` → `https://project-babel.com` in Vercel Domain settings.
- Monitor the automated weekly `.github/workflows/freshness-watch.yml` GitHub Action (Monday `06:00 UTC` + manual dispatch) for source drift/breakage issues and configure Neon backup/budget alerts.
