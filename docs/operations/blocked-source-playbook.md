# Blocked Source & Corpus Recovery Playbook

Operational runbook and audit ledger for JS-rendered portal capture (`law.go.kr`), manual-import provenance rules, completed Stage 4A/4B recoveries, and remaining deferred sovereign targets.

Machine-readable tracking files:
- [`data/source_tracking/kr_statutory_recovery_status.json`](../../data/source_tracking/kr_statutory_recovery_status.json)
- [`data/source_tracking/late_2026_priority_targets.json`](../../data/source_tracking/late_2026_priority_targets.json)
- [`docs/operations/source-inventory.md`](source-inventory.md) and [`docs/operations/source-quality-audit.md`](source-quality-audit.md)

---

## 0. Status Summary (As of November 21, 2026)

All Phase 3 / Section 0 corpus integrity blockers have been **resolved and verified**:
- **121 / 121** curated official documents (`US 29`, `EU 21`, `KR 17`, `JP 34`, `CN 20`; **77** active primary headline instruments) parsed cleanly under **Parser `0.3.0`** (`77 pymupdf`, `43 beautifulsoup4`, `1 hwpx_xml`; `0` stub/wiped docs, `0` synthetic manual imports remaining).
- **121 / 121** homogeneously analyzed under **Taxonomy v2.1.0** (`analysis_version: "0.3.0"`, `provider: "gemini"`, `model: "gemini-4-neon"`, `0` legacy artifacts) with **`2,271 / 2,271` (`100.0%`) exact verbatim grounding** and **`133 / 133`** artifacts passing `validate-artifacts` (`0` errors).

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
- **Never import synthetic summaries** or hand-written abstracts as raw PDFs/HTML. Every raw artifact must be the authentic government text or official translation published by the issuing body (the 2 legacy METI synthetic manual imports were replaced by official METI PDFs and deleted).
- `import-local-document` preserves provenance in `data/retrieval/<jurisdiction>/<document_id>.json` (`transport: "manual_import"`, SHA-256 hash, canonical URL).
- Follow every manual import with `parse-raw-documents <jurisdiction> <document_id> --refresh`, `report-source-quality-audit`, and `check-grounding`.

---

## 2. `browser_required` SPA guard & South Korea `law.go.kr` recovery (Completed)

Korea's National Law Information Center (`law.go.kr`) serves an unrendered ~144 KB JavaScript SPA shell to plain HTTP clients. `retrieval.py` now enforces a selector-aware **SPA-overwrite guard** (`blocked_spa_overwrite`, checking `browser_wait_for_selector` `#bodyContent` and nav-stripped length), while Playwright `context.route("**/*", ...)` validates every sub-request URL through `url_safety.py`.

All 3 previously wiped South Korean binding statutes have been **recovered via Playwright**, re-parsed with full statutory articles (`제1조`..`부칙`), and re-analyzed under Taxonomy v2.1.0 with `100.0%` verbatim grounding:
- `kr_ai_basic_act` (`274,592 B` browser HTML → `24,833+` clean parsed chars)
- `kr_ai_and_data_administration_act` (`260,661 B` browser HTML → `18,217+` clean parsed chars)
- `kr_ai_basic_act_enforcement_decree` (`255,408 B` browser HTML → `20,835+` clean parsed chars)

Recovery command template for future `law.go.kr` refreshes:
```bash
make browser-install
PYTHONPATH=services/pipeline/src python -m observatory.cli fetch-seed-documents south_korea --refresh --with-browser
PYTHONPATH=services/pipeline/src python -m observatory.cli parse-raw-documents south_korea --refresh
PYTHONPATH=services/pipeline/src python -m observatory.cli report-source-quality-audit
```

---

## 3. Completed Stub Replacements & Full-Context Re-Analysis

All 6 reachable broken/stubbed/synthetic documents were upgraded to full official PDFs and re-analyzed under Parser `0.3.0` + `gemini-4-neon` (1M-token single-pass direct context, zero truncation):
- `european_union/eu_gpai_scope_obligations_guidelines_2025` — upgraded to full 36-page `C(2025) 7719 final` PDF (`101,485` chars).
- `united_states/us_cfpb_chatbots_issue_spotlight_2023` — upgraded to official 23-page CFPB PDF (`52,839` chars; stale HTML removed).
- `united_states/us_nist_ai_rmf_playbook` — upgraded to official 147-page NIST AI RMF Playbook PDF (`339,508` chars; promoted to `primary_instrument`).
- `japan/jp_ai_governance_guidelines_2021` & `japan/jp_ai_governance_ver_1_1_report` — upgraded to official 82-page (`205,826` chars) and 34-page (`106,215` chars) METI PDFs; synthetic manual imports deleted.
- `south_korea/kr_ai_safety_guideline_2026_draft` — replaced HWP-CID mojibake PDF with clean 75-page UTF-8 MSIT/KOSA Support Desk PDF (`142,157` chars).
- Previously truncated mega-statutes (`eu_ai_act_regulation_2024_1689` `581,688c` / `158` sections, `eu_prohibited_ai_practices_guidelines`, `us_nist_ai_rmf_1_0`, `jp_ai_data_contract_guidelines_1_1_2019`, `kr_high_impact_ai_operator_obligations_guideline_2026`, etc.) all completed full single-pass `gemini-4-neon` analysis with `100.0%` verbatim grounding.

---

## 4. Late-2026 Expansion Ledger (`18` Ingested, `6` Honestly Deferred)

Tracked in [`data/source_tracking/late_2026_priority_targets.json`](../../data/source_tracking/late_2026_priority_targets.json) and `kr_statutory_recovery_status.json`:

### Newly ingested & v2.1.0-analyzed late-2026 / landmark instruments (`18` added → `121` total)
- **United States (`29` total):** EO 14409 (*Promoting Advanced AI Innovation and Security*, Jun 2026), EO 14434 (*Inaugurating the Era of Super Intelligence*, Sep 2026), EO 14365 (*Ensuring a National Policy Framework for AI*, Dec 2025), TAKE IT DOWN Act (Pub. L. 119-12), NIST CAISI AI/SI Agent Standards Initiative, and NIST IR 8596 Cyber AI Profile.
- **European Union (`21` total):** Regulation (EU) 2026/1744 (*Digital Omnibus on AI*, Jul 2026), Article 50 Transparency Guidelines (Nov 2026), and Code of Practice on Transparency of AI-Generated Content.
- **South Korea (`17` total):** High-Impact AI Determination Guideline (`kr_high_impact_ai_determination_guideline_2026`, 216p official PDF) alongside all 3 recovered `law.go.kr` binding statutes and the in-place clean UTF-8 75-page MSIT AI Safety Guideline revision (`CF00007573`).
- **Japan (`34` total):** Second AI Basic Plan (Jul 2026), full AI Promotion Act statute (Act No. 53 of 2025), MIC/METI AI Guidelines for Business Ver. 1.2 (Mar 2026), Japan AISI Evaluation Perspectives & Red Teaming Guides, and Hiroshima AI Process Code of Conduct.
- **China (`20` total):** TC260/CAC AI Safety Governance Framework 3.0 (Sep 2026, superseding 2024 v1.0) and State Council Opinion on Deepening "AI+" Action (`国发〔2025〕11号`).

### Honestly deferred targets (zero unverified or fabricated captures)
1. `cn_amended_cybersecurity_law_2025_art20` — `flk.npc.gov.cn` returned a non-JSON redirect during Stage 4A; retry or acquire authentic NPC PDF via `import-local-document`.
2. `GB 45438-2025` (Mandatory AI Content Labeling Standard) — SAMR viewer-gated without downloadable text.
3. `kr_national_ai_action_plan_2026_2028` — no direct canonical PDF link verified without false-match press releases.
4. `kr_ai_basic_act_data_amendment_2026` — Oct 2026 amendment bill not yet consolidated on `law.go.kr`.
5. `cn_ai_ethics_norms_2021` & `cn_ai_governance_principles_2019` — official MOST press releases retained as `historical_baseline` until canonical standalone full-text URLs are reachable.
6. Sub-national U.S. state statutes (`CA SB 53`, `CO SB 26-189`, `TX TRAIGA`, `NY RAISE`) remain isolated under `subnational_overlay_candidates` in `late_2026_priority_targets.json` to preserve sovereign-level comparability.
