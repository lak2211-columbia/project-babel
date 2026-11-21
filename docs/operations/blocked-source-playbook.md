# Blocked Source & Corpus Recovery Playbook

Operational runbook for resolving the Section 0 legacy corpus blocker, recovering JS-rendered portals (`law.go.kr`), safely handling manual imports, replacing stubs, re-analyzing previously truncated documents under Parser `0.3.0` + Taxonomy `2.1.0`, and ingesting the late-2026 sovereign expansion queue.

Machine-readable tracking files:
- [`data/source_tracking/kr_statutory_recovery_status.json`](../../data/source_tracking/kr_statutory_recovery_status.json)
- [`data/source_tracking/late_2026_priority_targets.json`](../../data/source_tracking/late_2026_priority_targets.json)
- [`docs/operations/source-inventory.md`](source-inventory.md) and [`docs/operations/source-quality-audit.md`](source-quality-audit.md)

---

## 0. Pre-Deploy Blocker: Legacy Corpus Re-Run Required

All 103 committed `document_analysis.json` artifacts on disk were produced by the legacy parser (`0.1.0`) and pre-v2.0 prompts without `analysis_metadata`, `input_sha256`, `chunk_count`, `frame_share`, `obligation_strength`, or Taxonomy v2.0/v2.1 labels (several long documents such as `eu_ai_act_regulation_2024_1689` were capped at ~5k tokens).

- `analyze-documents` now refuses to treat legacy provenance-free artifacts as current (`stale_legacy_no_provenance`).
- `persist-analysis-artifacts` refuses to fabricate provenance for legacy files unless `--allow-legacy` is explicitly passed (which records `taxonomy_version = "legacy"`).
- **Before publishing to production**, execute the ordered recovery & re-run checklist in [`vercel-launch.md`](vercel-launch.md) (browser re-fetch South Korea → re-fetch CFPB PDF → `parse-raw-documents --refresh` under Parser `0.3.0` → `analyze-documents --refresh` → `check-grounding` → `analyze-jurisdictions --refresh-existing` → `migrate-db` (`005`) → `persist-analysis-artifacts` → `POST /api/revalidate`).

---

## 1. Provenance rules for manual imports

When an official portal blocks automated crawlers or times out, acquire the **authentic official file** directly from the government authority and import it with full provenance:

```bash
# POSIX / Windows (with PYTHONPATH=services/pipeline/src)
python -m observatory.cli import-local-document \
  <jurisdiction> <document_id> /path/to/official_file.pdf \
  --source-url=<canonical_url> --content-type=application/pdf
```

**Strict provenance guardrails:**
- **Never import synthetic summaries** or hand-written abstracts as raw PDFs/HTML. Every raw artifact must be the authentic government text or official translation published by the issuing body.
- `import-local-document` preserves provenance in `data/retrieval/<jurisdiction>/<document_id>.json` (`transport: "manual_import"`, SHA-256 hash, canonical URL).
- Follow every manual import with `parse-raw-documents <jurisdiction> <document_id> --refresh`, `report-source-quality-audit`, and `check-grounding`.

---

## 2. `browser_required` SPA guard & South Korea `law.go.kr` recovery

### What happened & how the guard prevents recurrence

Korea's National Law Information Center (`law.go.kr`) serves an unrendered ~144 KB JavaScript SPA shell to plain HTTP clients (~385–431 extracted chars of navigation chrome, zero statutory articles). In April 2026, a plain-HTTP refresh overwrote three previously Playwright-captured Korean statutes (`236–307 KB`).

`services/pipeline/src/observatory/retrieval.py` now enforces an automatic **SPA-overwrite guard** (`blocked_spa_overwrite`) inspecting `browser_wait_for_selector` (`#bodyContent`) and nav-stripped text thresholds on `browser_required: true` documents, while Playwright `context.route("**/*", ...)` validates every sub-request URL through `url_safety.py`. `audit.py` explicitly flags SPA shells as `refetch_with_browser`.

### Recovery procedure for the 3 affected Korean statutes

Affected IDs (tracked in `data/source_tracking/kr_statutory_recovery_status.json`):
- `kr_ai_basic_act` (currently 385c parsed; last good Playwright capture 259,574 B)
- `kr_ai_and_data_administration_act` (currently 387c parsed; last good Playwright capture 236,350 B)
- `kr_ai_basic_act_enforcement_decree` (currently 431c parsed; last good Playwright capture 307,443 B)

**Do NOT run `analyze-documents south_korea --refresh` before restoring raw/parsed text** — existing `document_analysis.json` files were extracted from the earlier full-text captures (21k–29k tokens). Restore first via Playwright:

```bash
make browser-install
PYTHONPATH=services/pipeline/src python -m observatory.cli fetch-seed-documents south_korea --refresh --with-browser
PYTHONPATH=services/pipeline/src python -m observatory.cli parse-raw-documents south_korea --refresh
PYTHONPATH=services/pipeline/src python -m observatory.cli report-source-quality-audit
PYTHONPATH=services/pipeline/src python -m observatory.cli check-grounding south_korea
```

---

## 3. Forensic Investigations, Stub Replacements & Re-Analysis Queue

Tracked in `data/source_tracking/kr_statutory_recovery_status.json`:

### Forensic findings resolved in manifests
- **`us_cfpb_chatbots_issue_spotlight_2023`**: Attempt 1 saved the 464 KB PDF as `source.html` (sending binary bytes to Claude — 186k tokens, `policy_conf=0.45`, `0/7` grounded) before Attempt 2 overwrote it with a 1,189c landing blurb. Fixed in `data/sources/united_states.json` to `document_format: "pdf"` with the canonical CFPB PDF in `retrieval_urls` (`https://files.consumerfinance.gov/f/documents/cfpb_chatbot-issue-spotlight_2023-06.pdf`) — ready for clean re-fetch, re-parse, and re-analysis.
- **`us_nist_ai_rmf_1_0` vs `us_ai_risk_management_framework_second_draft_august_e303aeb7`**: Confirmed **distinct full PDFs** (`106,538c` vs `86,091c`, distinct SHA-256 hashes and quotes); identical `4,835` framing token counts occurred because both hit the legacy `14,000`-char framing truncation cap. Second draft is quarantined from headline metrics (`draft_consultation`/`superseded`); `us_nist_ai_rmf_1_0` is queued for full-context re-analysis.

### Canonical full-text replacements (7 documents)
- `european_union/eu_gpai_scope_obligations_guidelines_2025` — replace 2-page cover memo `C(2025) 5045 final` with the full ~40-page GPAI Guidelines Annex PDF.
- `united_states/us_cfpb_chatbots_issue_spotlight_2023` — re-fetch canonical CFPB PDF as `source.pdf` using updated manifest `retrieval_urls`, re-parse, and re-analyze.
- `united_states/us_nist_ai_rmf_playbook` — ingest official NIST Playbook JSON/PDF export or retain quarantined as `companion_resource`.
- `japan/jp_ai_governance_guidelines_2021` & `japan/jp_ai_governance_ver_1_1_report` — replace legacy synthetic summary PDFs (currently marked `historical_baseline`/`superseded`) with official METI PDFs (`20210709_9.pdf`, `20210709_8.pdf`).
- `china/cn_ai_ethics_norms_2021` & `china/cn_ai_governance_principles_2019` — replace short MOST press releases with canonical full normative texts.

### Full-corpus re-analysis priority (10 previously truncated statutes/guidelines)
Under Parser `0.3.0` (legal-heading sectionizer + PDF reflow) and token-aware chunking + Taxonomy `2.1.0` codebook-injected prompts, re-analyze the entire 103-document corpus, paying particular attention to these 10 previously truncated instruments:
1. `european_union/eu_ai_act_regulation_2024_1689` (`581,799c`)
2. `european_union/eu_prohibited_ai_practices_guidelines` (`421,669c`)
3. `japan/jp_ai_data_contract_guidelines_1_1_2019` (`385,884c`)
4. `japan/jp_ai_72333136` (`218,738c`)
5. `japan/jp_agri_ai_data_contract_guideline_2020` (`133,249c`)
6. `south_korea/kr_high_impact_ai_operator_obligations_guideline_2026` (`108,975c`)
7. `united_states/us_nist_ai_rmf_1_0` (`106,538c`)
8. `european_union/eu_gpai_code_safety_security_chapter_2025` (`105,445c`)
9. `japan/jp_ai_guidelines_for_business_ver_1_0` (`104,180c`, or supersede directly with Ver. 1.2)
10. `united_states/us_ai_risk_management_framework_second_draft_august_e303aeb7` (`86,091c`, quarantined draft)

---

## 4. Late-2026 priority expansion queue (`19` sovereign targets)

[`data/source_tracking/late_2026_priority_targets.json`](../../data/source_tracking/late_2026_priority_targets.json) stages **19 verified sovereign instruments** (plus **4 isolated US state overlay candidates** kept separate from sovereign baselines) ready for promotion into `data/sources/*.json` and ingestion via `make fetch && make parse && make analyze`:

- **United States:** EO 14409 (*Promoting Advanced AI Innovation and Security*, Jun 2, 2026), EO 14434 (*Inaugurating the Era of Super Intelligence*, Sep 29, 2026 — note `"Super Intelligence"` / `"SI"` terminology added to US discovery filters), Dec 11, 2025 National Policy Framework EO, TAKE IT DOWN Act (Pub. L. 119-12; FTC enforcement active May 19, 2026), NIST CAISI AI/SI Agent Standards Initiative & NIST IR 8596 Cyber AI Profile.
- **European Union:** Regulation (EU) 2026/1744 (*Digital Omnibus on AI*, Jul 8, 2026), Article 50 Transparency Guidelines (`C(2026) 5054 final`, active Aug 2, 2026), Code of Practice on Transparency of AI-Generated Content, Article 6 High-Risk Guidelines, and Apply AI Strategy.
- **South Korea:** Finalized MSIT AI Safety Assurance Guideline (superseding 2026 draft), South Korea AI Action Plan (2026–2028), Oct 13, 2026 Cabinet Amendments to the AI Basic Act & Data Industry Act, and PIPC PIPA AI special-provision updates.
- **Japan:** Second AI Basic Plan (Jul 14, 2026), MIC/METI AI Guidelines for Business Ver. 1.2 (Mar 31, 2026), Japan AISI (`aisi.go.jp`) Evaluation Perspectives & Red Teaming Guides, AI Promotion Act (Act No. 53 of 2025) full text, and Hiroshima AI Process Code of Conduct.
- **China:** TC260/CAC AI Safety Governance Framework 3.0 (Sep 14, 2026, agentic & embodied AI controls), Amended Cybersecurity Law (Art. 20, eff. Jan 1, 2026), State Council Opinion on Deepening "AI+" Action (Guo Fa [2025] No. 11), and Mandatory Standard GB 45438-2025.
