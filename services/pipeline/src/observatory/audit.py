from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

from observatory.coverage import TRACKING_DIR
from observatory.source_registry import ROOT, load_all_source_manifests


SOURCE_AUDIT_JSON_PATH = TRACKING_DIR / "source_quality_audit.json"
SOURCE_AUDIT_MARKDOWN_PATH = ROOT / "docs" / "operations" / "source-quality-audit.md"
RAW_DIR = ROOT / "data" / "raw"
PARSED_DIR = ROOT / "data" / "parsed"
ANALYSIS_DIR = ROOT / "data" / "analysis"

REMOVE_PATTERNS = (
    r"\bnot a policy document itself\b",
    r"\bno substantive policy content\b",
    r"\bredirect notice\b",
    r"\bredirect/navigation page\b",
    r"\borganizational page\b",
    r"\bservice desk\b",
    r"\bhelpdesk\b",
    r"\bwrapper_page\b",
    r"\bquestion submission portal\b",
    r"\bmeeting index page\b",
    r"\blists session dates\b",
    r"\bmoved page\b",
    r"\b移動ページ\b",
    r"\b開催状況\b",
)
REMOVE_TITLE_PATTERNS = (
    r"\bservice desk\b",
    r"\bexplorer\b",
    r"\bcontact\b",
    r"\bheadquarters\b",
    r"\bteam\b",
    r"\bmeeting\b",
    r"\bcomments received\b",
    r"\bconfirmation request\b",
    r"\b移動ページ\b",
    r"\b開催状況\b",
)
CONTEXT_PATTERNS = (
    r"\btimeline\b",
    r"\bwhistleblower\b",
    r"\bindex\b",
    r"\blist of\b",
    r"\bcasebook\b",
    r"\bbudget\b",
    r"\bpress release\b",
    r"\bnews announcement\b",
    r"\bissue spotlight\b",
    r"\bcomments received\b",
    r"\bcrosswalks?\b",
    r"\bcongressional mandates\b",
    r"\bchatbots in consumer finance\b",
    r"\bunveils\b",
    r"\bsummary page\b",
    r"\bcompanion document\b",
    r"\bunderlying guidance document is not included\b",
)
IMPLEMENTATION_RESOURCE_CONTEXT_PATTERNS = (
    r"\boverview\b",
    r"\btimeline\b",
    r"\bwhistleblower\b",
    r"\bnavigation\b",
    r"\btemplate\b",
    r"\btraining content\b",
    r"\bpublic summary\b",
    r"\bstandardisation\b",
)
SUPPORTING_PATTERNS = (
    r"\bquestions? and answers?\b",
    r"\bfaq\b",
    r"\bopinion\b",
    r"\bpolicy interpretation\b",
    r"\bexpert interpretation\b",
    r"\bimplementation notes\b",
)
POSITIVE_TITLE_PATTERNS = (
    r"\bact\b",
    r"\bregulation\b",
    r"\bguidelines?\b",
    r"\bguidance\b",
    r"\bframework\b",
    r"\bprinciples?\b",
    r"\bnorms?\b",
    r"\bprovisions?\b",
    r"\bmeasures?\b",
    r"\bdecree\b",
    r"\blaw\b",
    r"\bplan\b",
    r"\bstrategy\b",
    r"\bopinion\b",
    r"治理原则",
    r"发展规划",
    r"指导意见",
    r"基本計画",
    r"ガイドライン",
    r"法律",
    r"施行令",
    r"가이드라인",
    r"기본법",
    r"시행령",
)
FOUNDATIONAL_PATTERNS = (
    r"\bfoundational\b",
    r"\bnational_strategy\b",
    r"\bgovernance_principles\b",
    r"\bresponsible_ai\b",
    r"\bstate_council\b",
    r"\bai_plan\b",
    r"\bnational governance\b",
    r"治理原则",
    r"发展规划",
    r"指导意见",
    r"基本計画",
    r"ai strategy 2022",
)
PARTIAL_CAPTURE_PATTERNS = (
    r"\bactual .* referenced as an attachment\b",
    r"\bonly the meeting agenda was provided\b",
    r"\bvery limited substantive content\b",
    r"\bnot the full guideline text\b",
    r"\bconfidence is moderate because only\b",
)
HUB_LISTING_PATTERNS = (
    r"pdf形式",
    r"\bdownload\b",
    r"official source:",
    r"英訳はこちら",
)


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def _word_count(value: str | None) -> int:
    text = _normalize_text(value)
    if not text:
        return 0
    return len(text.split())


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _find_matches(text: str, patterns: tuple[str, ...]) -> list[str]:
    lower = text.casefold()
    matches: list[str] = []
    for pattern in patterns:
        if re.search(pattern, lower, re.IGNORECASE):
            matches.append(pattern)
    return matches


def _normalize_url(value: str | None) -> str:
    if not value:
        return ""
    parsed = urlparse(value)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", parsed.query, ""))


def _looks_like_document_asset(url: str | None) -> bool:
    normalized = _normalize_url(url).casefold()
    if not normalized:
        return False
    path = urlparse(normalized).path
    if path.endswith((".pdf", ".doc", ".docx", ".txt", ".xml")):
        return True
    return "download" in path or "filedown" in path or "get_pdf" in path


def _link_status(
    *,
    document: Any,
    parsed_word_count: int,
    plain_text: str | None,
    analysis_notes: str,
    raw_payload: dict[str, Any] | None,
) -> tuple[str, str | None, list[str], list[str]]:
    findings: list[str] = []
    metadata_issues: list[str] = []
    canonical_url = str(document.canonical_url)

    if document.publication_date is None:
        metadata_issues.append("missing publication_date")
    if not document.languages:
        metadata_issues.append("missing languages")

    if not isinstance(raw_payload, dict):
        if parsed_word_count <= 120:
            metadata_issues.append("missing raw metadata for thin document")
        return "unknown", None, findings, metadata_issues

    raw_publication_date = raw_payload.get("publication_date")
    if raw_publication_date and document.publication_date and raw_publication_date != document.publication_date:
        metadata_issues.append("seed publication_date differs from fetched metadata")

    transport = str(raw_payload.get("transport") or "")
    content_type = str(raw_payload.get("content_type") or "")
    if transport == "manual_import" and "html" in content_type.casefold():
        findings.append("document relies on a manually imported html stand-in instead of a fetched primary source")
        return "manual_import_html_standin", "replace_with_direct_document", findings, metadata_issues

    linked_artifact_url = raw_payload.get("linked_artifact_url")
    resolved_url = raw_payload.get("resolved_url")

    if linked_artifact_url:
        if _normalize_url(linked_artifact_url) == _normalize_url(canonical_url):
            return "direct_document", None, findings, metadata_issues
        findings.append("page source resolves through a linked downloadable artifact")
        return "hub_page_with_linked_artifact", "retarget_canonical_url", findings, metadata_issues

    if resolved_url and _normalize_url(resolved_url) != _normalize_url(canonical_url):
        if _looks_like_document_asset(resolved_url) and not _looks_like_document_asset(canonical_url):
            findings.append("canonical URL resolves to a different document asset")
            return "resolved_to_different_asset", "retarget_canonical_url", findings, metadata_issues
        if _looks_like_document_asset(resolved_url) and _looks_like_document_asset(canonical_url):
            findings.append("canonical URL redirects to a different file asset")
            return "resolved_to_updated_asset", "refresh_canonical_url", findings, metadata_issues
        findings.append("canonical URL resolves to a different page")
        return "resolved_to_different_page", None, findings, metadata_issues

    plain_text_normalized = _normalize_text(plain_text)
    hub_listing_matches = _find_matches(plain_text_normalized[:2400], HUB_LISTING_PATTERNS)
    partial_capture_matches = _find_matches(analysis_notes, PARTIAL_CAPTURE_PATTERNS)

    if partial_capture_matches:
        findings.append("analysis notes indicate partial or indirect capture")
        return "partial_capture", "inspect_source_capture", findings, metadata_issues

    if document.document_format == "html" and hub_listing_matches and parsed_word_count <= 900:
        findings.append("page appears to list document downloads instead of containing the source text")
        return "hub_page_listing_assets", "replace_with_direct_document", findings, metadata_issues

    return "direct_document", None, findings, metadata_issues


def _audit_document(jurisdiction: str, document: Any) -> dict[str, Any]:
    raw_path = RAW_DIR / jurisdiction / document.id / "metadata.json"
    parsed_path = PARSED_DIR / jurisdiction / document.id / "normalized.json"
    analysis_path = ANALYSIS_DIR / jurisdiction / document.id / "document_analysis.json"
    raw_payload = _load_json(raw_path)
    parsed_payload = _load_json(parsed_path)
    analysis_payload = _load_json(analysis_path)

    plain_text = parsed_payload.get("plain_text") if isinstance(parsed_payload, dict) else None
    parsed_word_count = _word_count(plain_text)
    analysis_notes = ""
    if isinstance(analysis_payload, dict):
        policy_extraction = analysis_payload.get("policy_extraction") or {}
        if isinstance(policy_extraction, dict):
            analysis_notes = _normalize_text(policy_extraction.get("implementation_notes"))

    title = _normalize_text(document.title)
    audit_text = " ".join(
        part for part in (title, analysis_notes, " ".join(document.tags), " ".join(document.policy_domains)) if part
    )

    score = 50
    findings: list[str] = []

    if document.document_type in {"legislation", "executive_order", "regulatory_guidance", "standards_guideline"}:
        score += 18
        findings.append("substantive document type")
    elif document.document_type in {"voluntary_commitment", "strategy_paper"}:
        score += 6
        findings.append("contextual or strategic document type")

    if document.source_tier in {"statutory_rule", "regulatory_guidance", "technical_standard"}:
        score += 18
        findings.append("high-signal source tier")
    elif document.source_tier in {"voluntary_framework", "policy_strategy"}:
        score += 10
        findings.append("secondary source tier")
    elif document.source_tier == "implementation_resource":
        score -= 8
        findings.append("implementation-resource tier")

    if parsed_word_count >= 1200:
        score += 12
        findings.append("substantive extracted text")
    elif parsed_word_count >= 400:
        score += 6
        findings.append("moderate extracted text")
    elif parsed_word_count <= 120:
        score -= 18
        findings.append("thin extracted text")

    positive_title_matches = _find_matches(audit_text, POSITIVE_TITLE_PATTERNS)
    if positive_title_matches:
        score += 8
        findings.append("title or notes indicate a substantive policy instrument")

    foundational_matches = _find_matches(audit_text, FOUNDATIONAL_PATTERNS)
    if foundational_matches:
        score += 12
        findings.append("foundational policy framing or strategy document")

    remove_matches = _find_matches(audit_text, REMOVE_PATTERNS)
    if remove_matches:
        score -= 60
        findings.append("explicitly non-substantive or navigational")

    remove_title_matches = _find_matches(title, REMOVE_TITLE_PATTERNS)
    if remove_title_matches:
        score -= 35
        findings.append("title indicates tool, meeting hub, or redirect page")

    context_matches = _find_matches(audit_text, CONTEXT_PATTERNS)
    if document.source_tier == "implementation_resource":
        context_matches.extend(_find_matches(audit_text, IMPLEMENTATION_RESOURCE_CONTEXT_PATTERNS))
    context_matches = sorted(set(context_matches))
    if context_matches:
        score -= 22
        findings.append("context-heavy or companion-page language")

    supporting_matches = _find_matches(audit_text, SUPPORTING_PATTERNS)
    if supporting_matches:
        score += 4
        findings.append("interpretive or Q&A companion value")

    if "provisional translation" in title.casefold():
        score += 4
        findings.append("useful official translation")

    (
        source_link_status,
        source_link_action,
        fidelity_findings,
        metadata_issues,
    ) = _link_status(
        document=document,
        parsed_word_count=parsed_word_count,
        plain_text=plain_text,
        analysis_notes=analysis_notes,
        raw_payload=raw_payload,
    )

    action = "keep_core"
    audit_bucket = "core"

    if remove_matches or remove_title_matches:
        action = "remove_from_seed"
        audit_bucket = "remove"
    elif score < 38:
        action = "remove_from_seed"
        audit_bucket = "remove"
    elif score < 52:
        action = "review_for_removal"
        audit_bucket = "context"
    elif score < 68:
        action = "keep_supporting"
        audit_bucket = "supporting"

    return {
        "jurisdiction": jurisdiction,
        "document_id": document.id,
        "title": document.title,
        "document_type": document.document_type,
        "binding_strength": document.binding_strength,
        "source_tier": document.source_tier,
        "publication_date": document.publication_date,
        "source_portal_ids": document.source_portal_ids,
        "parsed_word_count": parsed_word_count,
        "analysis_present": analysis_payload is not None,
        "score": score,
        "audit_bucket": audit_bucket,
        "action": action,
        "findings": findings,
        "metadata_issues": metadata_issues,
        "source_link_status": source_link_status,
        "source_link_action": source_link_action,
        "fidelity_findings": fidelity_findings,
        "remove_matches": remove_matches,
        "context_matches": context_matches,
        "analysis_notes": analysis_notes,
        "canonical_url": str(document.canonical_url),
    }


def build_source_quality_audit() -> dict[str, Any]:
    manifests = load_all_source_manifests()
    generated_at = datetime.now(timezone.utc).isoformat()
    jurisdictions: list[dict[str, Any]] = []
    global_recommendations: list[dict[str, Any]] = []
    source_repairs: list[dict[str, Any]] = []

    for manifest in manifests:
        records = [_audit_document(manifest.jurisdiction, document) for document in manifest.seed_documents]
        records.sort(key=lambda item: ({"remove_from_seed": 0, "review_for_removal": 1, "keep_supporting": 2, "keep_core": 3}[item["action"]], item["score"], item["title"]))

        summary = {
            "jurisdiction": manifest.jurisdiction,
            "seed_document_count": len(records),
            "action_counts": {},
            "bucket_counts": {},
            "documents": records,
        }
        for record in records:
            summary["action_counts"][record["action"]] = summary["action_counts"].get(record["action"], 0) + 1
            summary["bucket_counts"][record["audit_bucket"]] = summary["bucket_counts"].get(record["audit_bucket"], 0) + 1
            if record["action"] in {"remove_from_seed", "review_for_removal"}:
                global_recommendations.append(record)
            if record["source_link_action"] or record["metadata_issues"]:
                source_repairs.append(record)

        jurisdictions.append(summary)

    global_recommendations.sort(key=lambda item: ({"remove_from_seed": 0, "review_for_removal": 1}[item["action"]], item["score"], item["jurisdiction"], item["title"]))
    source_repairs.sort(key=lambda item: (0 if item["source_link_action"] else 1, item["jurisdiction"], item["title"]))

    return {
        "generated_at": generated_at,
        "audit_json_path": str(SOURCE_AUDIT_JSON_PATH.relative_to(ROOT)),
        "audit_markdown_path": str(SOURCE_AUDIT_MARKDOWN_PATH.relative_to(ROOT)),
        "jurisdictions": jurisdictions,
        "recommended_changes": global_recommendations,
        "source_repairs": source_repairs,
    }


def _format_counts(counts: dict[str, int]) -> str:
    if not counts:
        return "n/a"
    return ", ".join(f"`{key}={value}`" for key, value in sorted(counts.items()))


def _write_markdown(audit: dict[str, Any]) -> None:
    lines = [
        "# Source Quality Audit",
        "",
        "This file is generated from the seeded corpus plus parsed and analyzed artifacts.",
        "",
        f"- Generated at: `{audit['generated_at']}`",
        f"- JSON mirror: `{audit['audit_json_path']}`",
        "",
        "## Global Recommendations",
        "",
        "| Action | Jurisdiction | Score | Source tier | Document | Why flagged |",
        "| --- | --- | ---: | --- | --- | --- |",
    ]

    recommended_changes = audit["recommended_changes"]
    if recommended_changes:
        for item in recommended_changes[:80]:
            lines.append(
                f"| `{item['action']}` | `{item['jurisdiction']}` | `{item['score']}` | "
                f"`{item['source_tier']}` | `{item['document_id']}` | {'; '.join(item['findings']) or 'n/a'} |"
            )
    else:
        lines.append("| `n/a` | `n/a` | `0` | `n/a` | `n/a` | No flagged documents. |")

    lines.extend(
        [
            "",
            "## Source Repairs",
            "",
            "| Jurisdiction | Link status | Action | Document | Issue |",
            "| --- | --- | --- | --- | --- |",
        ]
    )
    if audit["source_repairs"]:
        for item in audit["source_repairs"][:80]:
            issue_notes = item["fidelity_findings"] + item["metadata_issues"]
            lines.append(
                f"| `{item['jurisdiction']}` | `{item['source_link_status']}` | "
                f"`{item['source_link_action'] or 'metadata_check'}` | "
                f"`{item['document_id']}` | {'; '.join(issue_notes) or 'n/a'} |"
            )
    else:
        lines.append("| `n/a` | `n/a` | `n/a` | `n/a` | No source-link or metadata repairs flagged. |")

    for jurisdiction in audit["jurisdictions"]:
        lines.extend(
            [
                "",
                f"## {jurisdiction['jurisdiction']}",
                "",
                f"- Seed documents audited: `{jurisdiction['seed_document_count']}`",
                f"- Actions: {_format_counts(jurisdiction['action_counts'])}",
                f"- Buckets: {_format_counts(jurisdiction['bucket_counts'])}",
                "",
                "| Action | Score | Tier | Link status | Link action | Document | Notes |",
                "| --- | ---: | --- | --- | --- | --- | --- |",
            ]
        )
        for item in jurisdiction["documents"]:
            if item["action"] == "keep_core" and not item["source_link_action"] and not item["metadata_issues"]:
                continue
            note_parts = item["findings"] + item["fidelity_findings"] + item["metadata_issues"]
            lines.append(
                f"| `{item['action']}` | `{item['score']}` | `{item['source_tier']}` | "
                f"`{item['source_link_status']}` | `{item['source_link_action'] or 'n/a'}` | "
                f"`{item['document_id']}` | {'; '.join(note_parts) or 'n/a'} |"
            )
        if all(
            item["action"] == "keep_core" and not item["source_link_action"] and not item["metadata_issues"]
            for item in jurisdiction["documents"]
        ):
            lines.append("| `n/a` | `0` | `n/a` | `n/a` | `n/a` | `n/a` | No flagged documents. |")

    SOURCE_AUDIT_MARKDOWN_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_AUDIT_MARKDOWN_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_source_quality_audit() -> dict[str, Any]:
    audit = build_source_quality_audit()
    SOURCE_AUDIT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_AUDIT_JSON_PATH.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    _write_markdown(audit)
    return audit
