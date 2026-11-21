# Blocked Source & Corpus Recovery Playbook

Operational runbook and audit ledger for JS-rendered portal capture (`law.go.kr`), manual-import provenance rules, completed Phase 4 & Phase 5A corpus expansions (`144 / 144` seeds present locally), and the remaining deferred sovereign targets.

*(Note: `make coverage` / `report-source-coverage` checks live inventory completeness — all **144 / 144** registered seed documents are present in the local corpus with `0` missing artifacts.)*

---

## 1. Current Corpus Health (Phase 5 Verified)

- **144 / 144** curated official documents across **61** official portals (**138** sovereign: `US 36`, `EU 24`, `KR 20`, `JP 37`, `CN 21` with **91** active primary headline instruments + **6** opt-in U.S. state `subnational_overlay` statutes; **12** `supersedes_id` amendment chains; window `2017 – Nov 19, 2026`).
- **144 / 144** parsed cleanly offline under **Parser `0.3.0`** (`93 pymupdf`, `48 beautifulsoup4`, `3 hwpx_xml`; `0` stub/wiped docs, `0` synthetic manual imports remaining; Korean `law.go.kr` `#hisComment`/`.cont_subtit` and CAC `cac.gov.cn` nav/footer chrome stripped cleanly).
- **144 / 144** analyzed homogeneously under **Taxonomy v2.1.0** (`analysis_version: "0.3.0"`, `provider: "gemini"`, `model: "gemini-4-neon"`, `0` legacy rows) with **`2,786 / 2,786` (`100.0%`) exact verbatim grounding** (`flagged = 0`).
- **Weekly Freshness Watch:** Automated every Monday at `06:00 UTC` via `.github/workflows/freshness-watch.yml` (`observatory check-freshness`) to flag source URL drift or portal breakage early.

---

## 2. Manual Import Provenance Rules

When an official portal blocks automated HTTP/Playwright requests (WAF/CAPTCHA/viewer-gating), acquire the authentic primary file manually from the official source and import it via:

```bash
PYTHONPATH=services/pipeline/src python -m observatory.cli import-local-document \
  <jurisdiction> <document_id> /path/to/official_file.pdf \
  --source-url=<canonical_url>
```

- **Never import synthetic summaries** or hand-written abstracts as raw PDFs/HTML. Every raw artifact must be the authentic government text or official translation published by the issuing body.
- Re-parse strictly offline (`parse-raw-documents <jurisdiction> <document_id> --refresh`), run analysis (`analyze-documents` or `ingest-document-analysis`), check grounding (`check-grounding`), and validate schemas (`validate-artifacts`).

---

## 3. Completed Forensic Recoveries & Expansions

### South Korea `law.go.kr` SPA Statutes (3 / 3 Recovered & Chrome-Cleaned)
- `south_korea/kr_ai_basic_act` — full enacted statute (`제1조(목적)`..`부칙`, `#hisComment`/`.cont_subtit` stripped cleanly under Parser `0.3.0`).
- `south_korea/kr_ai_basic_act_enforcement_decree` — full presidential enforcement decree (`제1조(목적)`..`별표`).
- `south_korea/kr_ai_and_data_administration_act` — full enacted statute (`제1조(목적)`..`부칙`).
- Protected permanently by `retrieval.py`'s selector-aware SPA-overwrite guard (`blocked_spa_overwrite` checking `#bodyContent`) and Playwright `context.route("**/*", ...)` SSRF filtering.

### Phase 4 Upgrades & Late-2026 Ingestion (`6` PDFs Upgraded + `18` Added → `121`)
- Upgraded 6 stub/mojibake/legacy documents in-place to full official PDFs (`eu_gpai_scope_obligations_guidelines_2025`, `us_cfpb_chatbots_issue_spotlight_2023`, `us_nist_ai_rmf_playbook`, `jp_ai_governance_guidelines_2021`, `jp_ai_governance_ver_1_1_report`, `kr_ai_safety_guideline_2026_draft`).
- Ingested 18 late-2026 landmarks across US (EO 14409, EO 14434, EO 14365, TAKE IT DOWN Act, NIST CAISI Agent Standards & IR 8596), EU (Digital Omnibus Reg. (EU) 2026/1744, Art. 50 Guidelines, Transparency Code of Practice), KR (High-Impact AI Determination Guideline), JP (Second AI Basic Plan, full AI Promotion Act, Guidelines Ver. 1.2, J-AISI guides, Hiroshima Code), and CN (TC260 Framework 3.0, State Council "AI+" Opinion).

### Phase 5A Surgical Corpus Expansion (`+23` Official Instruments → `144` Total)
- **United States Federal (`+7` → `36` federal):** HHS ONC HTI-1 Final Rule (`89 FR 1192`), Treasury AI Cybersecurity in Financial Services Report (`2024`), BIS Remote Access Semiconductor Rule (`91 FR 74970`, Nov 19, 2026), BIS Advanced Computing License Policy (`91 FR 1684`, Jan 2026), U.S. Copyright Office AI Reports Part 2 & Part 3 (`2025`), DoD Directive 3000.09 Autonomy in Weapon Systems (`2023`).
- **United States Opt-In State Overlay (`+6`, `corpus_role: "subnational_overlay"`):** California SB 53 (TFAIA), California AB 2013 (Training Data Transparency), Colorado SB 24-205 (`superseded`), Colorado SB 26-189 ADMT Act (`supersedes: us_co_sb_24_205_ai_act_2024`), Texas HB 149 (TRAIGA), New York RAISE Act (`S6953A`).
- **European Union (`+3` → `24`):** 2020 AI White Paper (`COM(2020) 65 final`, `historical_baseline`), 2021 Coordinated Plan Review (`COM(2021) 205 final`, `historical_baseline`), Implementing Regulation (EU) 2025/454 (AI Scientific Panel).
- **South Korea (`+3` → `20`):** National AI Action Plan 2026–2028 (`kr_national_ai_action_plan_2026_2028`, official NAISC HWPX), FSC/FSI Frontier AI Security Guideline (`2026` HWPX), FSC Financial AI Guideline (`2021`, `historical_baseline`).
- **Japan (`+3` → `37`):** FSA AI Discussion Paper v1.1 (`2026`), METI Cloud Program Economic Security Policy (`2024`), Agency for Cultural Affairs (Bunka) AI Copyright Checklist & Guidance (`2024`).
- **China (`+1` → `21`):** MIIT Comprehensive Standardization System Guidelines for the AI Industry (`工信部联科〔2024〕113号`).

---

## 4. Remaining Honestly Deferred Sovereign Targets

Tracked transparently in [`data/source_tracking/late_2026_priority_targets.json`](../../data/source_tracking/late_2026_priority_targets.json) (zero unverified mirrors or fabricated captures):

1. `cn_amended_cybersecurity_law_2025_art20` — confirmed live at `flk.npc.gov.cn` (`2025-10-28`, eff. `2026-01-01`), API redirect requires clean manual/browser official PDF capture via `import-local-document`.
2. `GB 45438-2025` (Mandatory AI Content Labeling Standard) — SAMR portal viewer-gated without downloadable text.
3. `kr_ai_basic_act_data_amendment_2026` — Oct 2026 Cabinet amendment bill not yet consolidated as enacted law on `law.go.kr`.
4. `cn_ai_ethics_norms_2021` & `cn_ai_governance_principles_2019` — official MOST press releases retained as primary/baseline texts until canonical standalone full-text URLs are directly retrievable.
