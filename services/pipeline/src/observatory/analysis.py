from __future__ import annotations

import json
import os
import shutil
import socket
import time
from collections import Counter, defaultdict
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import Field, ValidationError

from observatory.db import PostgresAnalysisStore
from observatory.models import (
    DocumentAnalysis,
    EnforcementMechanism,
    JurisdictionAnalysis,
    JurisdictionFrameStat,
    JurisdictionLabelStat,
    JurisdictionSourceReference,
    PolicyExtraction,
    RiskFramingAnalysis,
    SafetyRequirement,
    StrictBaseModel,
)
from observatory.parser import PARSED_DATA_DIR, ParsedDocument
from observatory.persistence import (
    AnalysisStore,
    build_analysis_persistence_bundle,
    build_jurisdiction_analysis_persistence_bundle,
)
from observatory.prompts import load_prompt
from observatory.source_registry import ROOT, load_all_source_manifests
from observatory.taxonomy import load_taxonomy


ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_EFFORT = "low"
DEFAULT_MAX_RETRIES = 3
RETRYABLE_HTTP_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
ANALYSIS_DIR = ROOT / "data" / "analysis"
RAW_DATA_DIR = ROOT / "data" / "raw"
UNSUPPORTED_ANTHROPIC_SCHEMA_KEYS = {
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
}
POLICY_METADATA_MAX_CHARS = 14000
POLICY_CONTROLS_MAX_CHARS = 18000
RISK_FRAMING_MAX_CHARS = 14000
POLICY_METADATA_KEYWORDS = (
    "scope",
    "purpose",
    "objective",
    "definition",
    "applies",
    "operator",
    "provider",
    "developer",
    "deployer",
    "user",
    "authority",
    "penalt",
    "fine",
    "deadline",
    "application date",
    "entry into force",
    "effective",
)
POLICY_CONTROLS_KEYWORDS = (
    "risk management",
    "testing",
    "test",
    "red-team",
    "red team",
    "evaluation",
    "audit",
    "oversight",
    "incident",
    "monitor",
    "disclosure",
    "document",
    "logging",
    "record",
    "transparency",
    "security",
    "safety",
    "prohibit",
    "banned",
    "enforcement",
    "inspection",
    "certification",
)
RISK_FRAMING_KEYWORDS = (
    "security",
    "national security",
    "competition",
    "competitiveness",
    "innovation",
    "rights",
    "fundamental rights",
    "privacy",
    "safety",
    "public order",
    "social stability",
    "society",
    "trust",
    "harm",
    "human dignity",
    "economic growth",
)
LOW_FIDELITY_PARSER_WARNINGS = {
    "image_only_html_content",
    "empty_html_after_cleaning",
}
MIN_ANALYSIS_NON_WHITESPACE_CHARS = 160
MIN_SUBSTANTIVE_SECTION_CHARS = 40
JURISDICTION_ANALYSIS_VERSION = "0.1.0"
JURISDICTION_ANALYSIS_METHOD = "deterministic_v1"
JURISDICTION_DISPLAY_NAMES = {
    "united_states": "United States",
    "european_union": "European Union",
    "south_korea": "South Korea",
    "japan": "Japan",
    "china": "China",
}
DOCUMENT_TYPE_LABELS = {
    "legislation": "legislation",
    "executive_order": "executive action",
    "regulatory_guidance": "regulatory guidance",
    "strategy_paper": "strategy paper",
    "standards_guideline": "standards guidance",
    "voluntary_commitment": "voluntary commitment",
}
BINDING_STRENGTH_LABELS = {
    "binding_law": "binding law",
    "executive_action": "executive action",
    "regulatory_guidance": "regulatory guidance",
    "standards_guideline": "standards guidance",
    "voluntary_commitment": "voluntary commitment",
    "strategy_statement": "strategy statement",
}
FRAME_LABELS = {
    "existential_catastrophic": "Existential or catastrophic risk",
    "national_security": "National security",
    "economic_competitiveness": "Economic competitiveness",
    "fundamental_rights": "Fundamental rights",
    "social_stability": "Social stability and public order",
    "innovation_enablement": "Innovation enablement",
    "consumer_public_safety": "Consumer and public safety",
    "labor_transition": "Labor and economic transition",
}
LABEL_TEXT = {
    "risk_assessment": "risk assessment",
    "pre_deployment_testing": "pre-deployment testing",
    "red_teaming": "red-teaming",
    "incident_reporting": "incident reporting",
    "transparency_disclosure": "transparency and disclosure",
    "model_documentation": "model documentation",
    "third_party_audit": "third-party audit",
    "access_controls": "access controls",
    "compute_governance": "compute governance",
    "content_provenance": "content provenance",
    "human_oversight": "human oversight",
    "registration_licensing": "registration or licensing",
    "civil_penalty": "civil penalties",
    "criminal_penalty": "criminal penalties",
    "market_access_restriction": "market-access restrictions",
    "procurement_condition": "procurement conditions",
    "licensing_requirement": "licensing requirements",
    "regulatory_supervision": "regulatory supervision",
    "reporting_obligation": "reporting obligations",
    "soft_enforcement": "soft enforcement",
    "none_specified": "no explicit enforcement mechanism",
}
BINDING_PROFILE_ORDER = {
    "binding_law": 0,
    "executive_action": 1,
    "regulatory_guidance": 2,
    "standards_guideline": 3,
    "strategy_statement": 4,
    "voluntary_commitment": 5,
}
SOURCE_SALIENCE_WEIGHT = {
    "binding_law": 5.0,
    "executive_action": 4.2,
    "regulatory_guidance": 3.8,
    "standards_guideline": 3.0,
    "strategy_statement": 2.8,
    "voluntary_commitment": 2.4,
}


class StructuredOutputClient(Protocol):
    def create_json_response(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        schema: dict[str, Any],
        max_tokens: int,
    ) -> tuple[dict[str, Any], dict[str, Any]]: ...


@dataclass
class ParsedDocumentRecord:
    jurisdiction: str
    document_id: str
    parsed_path: Path
    parsed_document: ParsedDocument
    raw_metadata: dict[str, Any]


@dataclass
class JurisdictionDocumentRecord:
    parsed_record: ParsedDocumentRecord
    analysis: DocumentAnalysis
    publication_date: str | None


class PolicyMetadataExtraction(StrictBaseModel):
    issuing_body: str
    document_type: str
    binding_strength: str
    publication_date: str | None = None
    effective_date: str | None = None
    covered_actors: list[str] = Field(default_factory=list)
    covered_application_domains: list[str] = Field(default_factory=list)
    prohibited_practices: list[str] = Field(default_factory=list)
    enforcement_authorities: list[str] = Field(default_factory=list)
    compliance_deadlines: list[str] = Field(default_factory=list)
    penalties_summary: str | None = None
    implementation_notes: str | None = None
    confidence: float


class PolicyControlsExtraction(StrictBaseModel):
    safety_requirements: list[SafetyRequirement] = Field(default_factory=list)
    enforcement_mechanisms: list[EnforcementMechanism] = Field(default_factory=list)


class ClaudeAPIClient:
    provider = "anthropic"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        effort: str | None = None,
        anthropic_version: str = DEFAULT_ANTHROPIC_VERSION,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ) -> None:
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY is required")
        self.model = model or os.getenv("ANTHROPIC_MODEL", DEFAULT_MODEL)
        self.effort = effort or os.getenv("ANTHROPIC_EFFORT", DEFAULT_EFFORT)
        self.anthropic_version = anthropic_version
        self.max_retries = max(max_retries, 1)

    def create_json_response(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        schema: dict[str, Any],
        max_tokens: int,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        sanitized_schema = _sanitize_schema_for_anthropic(schema)
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "output_config": {
                "effort": self.effort,
                "format": {
                    "type": "json_schema",
                    "schema": sanitized_schema,
                },
            },
        }
        request = Request(
            ANTHROPIC_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "x-api-key": self.api_key,
                "anthropic-version": self.anthropic_version,
            },
            method="POST",
        )
        response_payload: dict[str, Any] | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                with urlopen(request, timeout=120) as response:
                    response_payload = json.load(response)
                break
            except HTTPError as exc:
                message = exc.read().decode("utf-8", errors="ignore")
                if exc.code in RETRYABLE_HTTP_STATUS_CODES and attempt < self.max_retries:
                    time.sleep(min(2 ** (attempt - 1), 8))
                    continue
                raise RuntimeError(f"Anthropic API HTTP {exc.code}: {message}") from exc
            except (TimeoutError, socket.timeout) as exc:
                if attempt < self.max_retries:
                    time.sleep(min(2 ** (attempt - 1), 8))
                    continue
                raise RuntimeError("Anthropic API request timed out") from exc
            except URLError as exc:
                if attempt < self.max_retries:
                    time.sleep(min(2 ** (attempt - 1), 8))
                    continue
                raise RuntimeError(f"Anthropic API network error: {exc.reason}") from exc

        if response_payload is None:
            raise RuntimeError("Anthropic API request failed without a response payload")

        text_blocks = [
            block.get("text", "")
            for block in response_payload.get("content", [])
            if block.get("type") == "text"
        ]
        if not text_blocks:
            raise RuntimeError("Anthropic API returned no text content")

        json_payload = json.loads("".join(text_blocks))
        return json_payload, response_payload


def _primary_language(record: ParsedDocumentRecord) -> str:
    if record.parsed_document.language:
        return record.parsed_document.language
    metadata_language = record.raw_metadata.get("language")
    if isinstance(metadata_language, str) and metadata_language:
        return metadata_language
    metadata_languages = record.raw_metadata.get("languages")
    if isinstance(metadata_languages, list) and metadata_languages:
        primary = metadata_languages[0]
        if isinstance(primary, str) and primary:
            return primary
    return "unknown"


def _source_url(record: ParsedDocumentRecord) -> str:
    candidate = record.raw_metadata.get("source_url") or record.raw_metadata.get("canonical_url")
    if isinstance(candidate, str) and candidate:
        return candidate
    return "unknown"


def _load_parsed_document_records(
    jurisdiction: str | None = None,
    document_id: str | None = None,
) -> list[ParsedDocumentRecord]:
    allowed_documents_by_jurisdiction: dict[str, set[str]] = {}
    for manifest in load_all_source_manifests():
        if jurisdiction is not None and manifest.jurisdiction != jurisdiction:
            continue
        allowed_documents_by_jurisdiction[manifest.jurisdiction] = {
            document.id for document in manifest.seed_documents
        }

    records: list[ParsedDocumentRecord] = []
    for parsed_path in sorted(PARSED_DATA_DIR.glob("*/*/normalized.json")):
        with parsed_path.open("r", encoding="utf-8") as handle:
            parsed_payload = json.load(handle)
        parsed_document = ParsedDocument.model_validate(parsed_payload)
        doc_jurisdiction = parsed_path.parts[-3]
        doc_id = parsed_path.parts[-2]
        if jurisdiction is not None and doc_jurisdiction != jurisdiction:
            continue
        if document_id is not None and doc_id != document_id:
            continue
        if doc_id not in allowed_documents_by_jurisdiction.get(doc_jurisdiction, set()):
            continue

        metadata_path = RAW_DATA_DIR / doc_jurisdiction / doc_id / "metadata.json"
        raw_metadata = {}
        if metadata_path.exists():
            with metadata_path.open("r", encoding="utf-8") as handle:
                raw_metadata = json.load(handle)

        records.append(
            ParsedDocumentRecord(
                jurisdiction=doc_jurisdiction,
                document_id=doc_id,
                parsed_path=parsed_path,
                parsed_document=parsed_document,
                raw_metadata=raw_metadata,
            )
        )

    return records


def _policy_extraction_schema() -> dict[str, Any]:
    taxonomy = load_taxonomy()
    schema = PolicyExtraction.model_json_schema()
    properties = schema["properties"]
    properties["jurisdiction"]["enum"] = taxonomy["jurisdictions"]
    properties["document_type"]["enum"] = taxonomy["document_types"]
    properties["binding_strength"]["enum"] = taxonomy["binding_strength"]
    properties["covered_application_domains"]["items"]["enum"] = taxonomy["application_domains"]
    _inject_enum_into_array_item_label(
        schema,
        array_field="safety_requirements",
        allowed_values=taxonomy["policy_requirements"],
    )
    _inject_enum_into_array_item_label(
        schema,
        array_field="enforcement_mechanisms",
        allowed_values=taxonomy["enforcement_mechanisms"],
    )
    return schema


def _policy_metadata_schema() -> dict[str, Any]:
    taxonomy = load_taxonomy()
    schema = PolicyMetadataExtraction.model_json_schema()
    properties = schema["properties"]
    properties["document_type"]["enum"] = taxonomy["document_types"]
    properties["binding_strength"]["enum"] = taxonomy["binding_strength"]
    properties["covered_application_domains"]["items"]["enum"] = taxonomy["application_domains"]
    return schema


def _policy_controls_schema() -> dict[str, Any]:
    taxonomy = load_taxonomy()
    schema = PolicyControlsExtraction.model_json_schema()
    _inject_enum_into_array_item_label(
        schema,
        array_field="safety_requirements",
        allowed_values=taxonomy["policy_requirements"],
    )
    _inject_enum_into_array_item_label(
        schema,
        array_field="enforcement_mechanisms",
        allowed_values=taxonomy["enforcement_mechanisms"],
    )
    return schema


def _risk_framing_schema() -> dict[str, Any]:
    taxonomy = load_taxonomy()
    schema = RiskFramingAnalysis.model_json_schema()
    properties = schema["properties"]
    properties["dominant_frame"]["enum"] = taxonomy["risk_framings"]
    properties["secondary_frames"]["items"]["enum"] = taxonomy["risk_framings"]
    properties["frame_confidence"] = {
        "type": "object",
        "properties": {
            frame: {
                "type": "number",
            }
            for frame in taxonomy["risk_framings"]
        },
        "additionalProperties": False,
        "default": {},
    }
    return schema


def _inject_enum_into_array_item_label(
    schema: dict[str, Any],
    *,
    array_field: str,
    allowed_values: list[str],
) -> None:
    items = schema["properties"][array_field]["items"]
    if "properties" in items:
        items["properties"]["label"]["enum"] = allowed_values
        return

    ref = items.get("$ref")
    if not ref:
        raise ValueError(f"expected inline properties or $ref for field '{array_field}'")
    ref_key = ref.removeprefix("#/$defs/")
    defs = schema.get("$defs", {})
    if ref_key not in defs:
        raise ValueError(f"schema reference '{ref}' not found for field '{array_field}'")
    defs[ref_key]["properties"]["label"]["enum"] = allowed_values


def _validate_taxonomy_alignment(
    extraction: PolicyExtraction,
    framing: RiskFramingAnalysis,
) -> None:
    taxonomy = load_taxonomy()
    if extraction.jurisdiction not in taxonomy["jurisdictions"]:
        raise ValueError(f"unknown jurisdiction label '{extraction.jurisdiction}'")
    if extraction.document_type not in taxonomy["document_types"]:
        raise ValueError(f"unknown document type label '{extraction.document_type}'")
    if extraction.binding_strength not in taxonomy["binding_strength"]:
        raise ValueError(f"unknown binding strength label '{extraction.binding_strength}'")
    for domain in extraction.covered_application_domains:
        if domain not in taxonomy["application_domains"]:
            raise ValueError(f"unknown application domain label '{domain}'")
    for requirement in extraction.safety_requirements:
        if requirement.label not in taxonomy["policy_requirements"]:
            raise ValueError(f"unknown safety requirement label '{requirement.label}'")
    for mechanism in extraction.enforcement_mechanisms:
        if mechanism.label not in taxonomy["enforcement_mechanisms"]:
            raise ValueError(f"unknown enforcement mechanism label '{mechanism.label}'")
    valid_frames = set(taxonomy["risk_framings"])
    if framing.dominant_frame not in valid_frames:
        raise ValueError(f"unknown dominant frame label '{framing.dominant_frame}'")
    for frame in framing.secondary_frames:
        if frame not in valid_frames:
            raise ValueError(f"unknown secondary frame label '{frame}'")
    for frame in framing.frame_confidence:
        if frame not in valid_frames:
            raise ValueError(f"unknown frame confidence label '{frame}'")


def _build_system_prompt(prompt_filename: str, schema: dict[str, Any]) -> str:
    sanitized_schema = _sanitize_schema_for_anthropic(schema)
    base_prompt = load_prompt(prompt_filename)
    return (
        f"{base_prompt}\n\n"
        "Return only valid JSON that matches the provided schema. "
        "Do not add prose before or after the JSON.\n\n"
        f"JSON schema:\n{json.dumps(sanitized_schema, ensure_ascii=False, indent=2)}"
    )


def _build_task_system_prompt(
    prompt_filename: str,
    schema: dict[str, Any],
    *,
    focus_instructions: str,
) -> str:
    return f"{_build_system_prompt(prompt_filename, schema)}\n\nTask focus:\n{focus_instructions}"


def _sanitize_schema_for_anthropic(schema: dict[str, Any]) -> dict[str, Any]:
    def sanitize(value: Any) -> Any:
        if isinstance(value, dict):
            sanitized: dict[str, Any] = {}
            for key, item in value.items():
                if key in UNSUPPORTED_ANTHROPIC_SCHEMA_KEYS:
                    continue
                sanitized[key] = sanitize(item)
            return sanitized
        if isinstance(value, list):
            return [sanitize(item) for item in value]
        return value

    return sanitize(deepcopy(schema))


def _build_user_prompt(record: ParsedDocumentRecord, *, excerpt: str, task_label: str) -> str:
    return (
        f"Document ID: {record.document_id}\n"
        f"Jurisdiction: {record.jurisdiction}\n"
        f"Title: {record.raw_metadata.get('title', record.parsed_document.title)}\n"
        f"Language: {_primary_language(record)}\n"
        f"Source URL: {_source_url(record)}\n"
        f"Task: {task_label}\n\n"
        "Document excerpt selected for this task:\n"
        f"{excerpt}"
    )


def _normalize_excerpt_text(value: str) -> str:
    return " ".join(value.split())


def _truncate_excerpt(value: str, max_chars: int) -> str:
    normalized = value.strip()
    if len(normalized) <= max_chars:
        return normalized
    cutoff = max_chars - len("\n\n[truncated]")
    if cutoff <= 0:
        return "[truncated]"
    return normalized[:cutoff].rstrip() + "\n\n[truncated]"


def _section_score(text: str, keywords: tuple[str, ...]) -> int:
    lowered = text.lower()
    return sum(lowered.count(keyword) for keyword in keywords)


def _build_analysis_excerpt(
    record: ParsedDocumentRecord,
    *,
    keywords: tuple[str, ...],
    max_chars: int,
) -> str:
    sections = record.parsed_document.sections
    if not sections:
        return _truncate_excerpt(record.parsed_document.plain_text, max_chars)

    scored_sections: list[tuple[int, int, str]] = []
    for index, section in enumerate(sections):
        content = _normalize_excerpt_text(section.content)
        if not content:
            continue
        heading = _normalize_excerpt_text(section.heading)
        block = content
        if heading:
            block = f"Section: {heading}\n{content}"
        score = _section_score(block, keywords)
        if index < 2:
            score += 1
        scored_sections.append((score, index, block))

    if not scored_sections:
        return _truncate_excerpt(record.parsed_document.plain_text, max_chars)

    prioritized = sorted(scored_sections, key=lambda item: (-item[0], item[1]))
    selected_indexes: set[int] = set()
    for _, index, _ in prioritized:
        selected_indexes.add(index)
        if len(selected_indexes) >= 8:
            break
    ordered_blocks = [block for _, index, block in sorted(scored_sections, key=lambda item: item[1]) if index in selected_indexes]
    excerpt = "\n\n".join(ordered_blocks)
    if len(excerpt) < max_chars // 2:
        excerpt = record.parsed_document.plain_text
    return _truncate_excerpt(excerpt, max_chars)


def analyze_jurisdictions(
    *,
    jurisdiction: str | None = None,
    store: AnalysisStore | None = None,
    refresh_existing: bool = False,
) -> list[dict[str, str]]:
    records = _load_parsed_document_records(jurisdiction=jurisdiction)
    jurisdictions = sorted({record.jurisdiction for record in records})
    if not jurisdictions:
        raise ValueError("no parsed documents matched the requested filters")

    if store is None and os.getenv("DATABASE_URL"):
        store = PostgresAnalysisStore()

    results: list[dict[str, str]] = []
    for current_jurisdiction in jurisdictions:
        output_dir = _jurisdiction_analysis_root() / current_jurisdiction
        output_path = output_dir / "jurisdiction_analysis.json"
        if output_path.exists() and not refresh_existing:
            results.append(
                {
                    "jurisdiction": current_jurisdiction,
                    "status": "skipped_existing",
                }
            )
            continue

        analyzed_documents = _load_jurisdiction_documents(current_jurisdiction)
        if not analyzed_documents:
            results.append(
                {
                    "jurisdiction": current_jurisdiction,
                    "status": "skipped_no_analyzed_documents",
                }
            )
            continue

        digest = _build_jurisdiction_input_digest(current_jurisdiction, analyzed_documents)
        analysis = _build_jurisdiction_analysis(current_jurisdiction, analyzed_documents, digest)
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "jurisdiction_input_digest.json").write_text(
            json.dumps(digest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (output_dir / "jurisdiction_analysis.json").write_text(
            analysis.model_dump_json(indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        if store is not None:
            try:
                bundle = build_jurisdiction_analysis_persistence_bundle(
                    analysis=analysis,
                    input_digest=digest,
                )
                store.persist_jurisdiction_analysis_bundle(bundle)
            except Exception as exc:
                results.append(
                    {
                        "jurisdiction": current_jurisdiction,
                        "status": f"persist_error:{type(exc).__name__}",
                    }
                )
                continue

        results.append(
            {
                "jurisdiction": current_jurisdiction,
                "status": "analyzed",
            }
        )

    return results


def _load_jurisdiction_documents(jurisdiction: str) -> list[JurisdictionDocumentRecord]:
    documents: list[JurisdictionDocumentRecord] = []
    for record in _load_parsed_document_records(jurisdiction=jurisdiction):
        try:
            analysis, _raw_policy_response, _raw_framing_response = _load_analysis_artifacts(record)
        except (ValidationError, ValueError, RuntimeError, json.JSONDecodeError, OSError):
            continue
        publication_date = (
            record.raw_metadata.get("publication_date")
            or record.raw_metadata.get("source_publication_date")
            or analysis.policy_extraction.publication_date
        )
        documents.append(
            JurisdictionDocumentRecord(
                parsed_record=record,
                analysis=analysis,
                publication_date=publication_date if isinstance(publication_date, str) else None,
            )
        )
    return documents


def _jurisdiction_analysis_root() -> Path:
    return ANALYSIS_DIR / "jurisdictions"


def _build_jurisdiction_input_digest(
    jurisdiction: str,
    documents: list[JurisdictionDocumentRecord],
) -> dict[str, Any]:
    document_type_counts = Counter[str]()
    binding_counts = Counter[str]()
    requirement_counts = Counter[str]()
    enforcement_counts = Counter[str]()
    institution_counts = Counter[str]()
    frame_score_totals: dict[str, float] = defaultdict(float)
    frame_document_mentions = Counter[str]()

    serialized_documents: list[dict[str, Any]] = []
    date_values = [item.publication_date for item in documents if item.publication_date]
    for item in documents:
        extraction = item.analysis.policy_extraction
        framing = item.analysis.risk_framing
        document_type_counts[extraction.document_type] += 1
        binding_counts[extraction.binding_strength] += 1
        if extraction.issuing_body:
            institution_counts[extraction.issuing_body] += 1
        for authority in extraction.enforcement_authorities:
            if authority:
                institution_counts[authority] += 1
        for requirement in extraction.safety_requirements:
            requirement_counts[requirement.label] += 1
        for mechanism in extraction.enforcement_mechanisms:
            enforcement_counts[mechanism.label] += 1

        seen_frames: set[str] = set()
        for frame, score in framing.frame_confidence.items():
            frame_score_totals[frame] += score
            if score >= 0.15:
                seen_frames.add(frame)
        if not framing.frame_confidence and framing.dominant_frame:
            frame_score_totals[framing.dominant_frame] += 1.0
            seen_frames.add(framing.dominant_frame)
        elif framing.dominant_frame:
            seen_frames.add(framing.dominant_frame)
        for frame in seen_frames:
            frame_document_mentions[frame] += 1

        serialized_documents.append(
            {
                "document_id": item.parsed_record.document_id,
                "title": item.analysis.title,
                "publication_date": item.publication_date,
                "issuing_body": extraction.issuing_body,
                "document_type": extraction.document_type,
                "binding_strength": extraction.binding_strength,
                "dominant_frame": item.analysis.risk_framing.dominant_frame,
                "secondary_frames": item.analysis.risk_framing.secondary_frames,
                "top_requirements": [requirement.label for requirement in extraction.safety_requirements[:3]],
                "top_enforcement_mechanisms": [
                    mechanism.label for mechanism in extraction.enforcement_mechanisms[:3]
                ],
                "implementation_notes": extraction.implementation_notes,
                "framing_rationale_summary": item.analysis.risk_framing.rationale_summary,
                "confidence": round(
                    (
                        extraction.confidence
                        + item.analysis.risk_framing.frame_confidence.get(
                            item.analysis.risk_framing.dominant_frame,
                            0.0,
                        )
                    )
                    / 2,
                    3,
                ),
            }
        )

    return {
        "jurisdiction": jurisdiction,
        "source_count": len(documents),
        "source_window_start": _sorted_dates(date_values)[0] if date_values else None,
        "source_window_end": _sorted_dates(date_values)[-1] if date_values else None,
        "documents": serialized_documents,
        "aggregates": {
            "document_types": _counter_to_digest(document_type_counts, len(documents)),
            "binding_strengths": _counter_to_digest(
                binding_counts,
                len(documents),
                sort_order=BINDING_PROFILE_ORDER,
            ),
            "requirements": _counter_to_digest(requirement_counts, len(documents)),
            "enforcement_mechanisms": _counter_to_digest(enforcement_counts, len(documents)),
            "institutions": _counter_to_digest(institution_counts, len(documents)),
            "frames": _frame_digest(frame_score_totals, frame_document_mentions),
        },
    }


def _build_jurisdiction_analysis(
    jurisdiction: str,
    documents: list[JurisdictionDocumentRecord],
    digest: dict[str, Any],
) -> JurisdictionAnalysis:
    aggregates = digest["aggregates"]
    binding_stats = _digest_to_label_stats(aggregates["binding_strengths"], limit=3)
    document_type_stats = _digest_to_label_stats(aggregates["document_types"], limit=3)
    requirement_stats = _digest_to_label_stats(aggregates["requirements"], limit=4)
    enforcement_stats = _digest_to_label_stats(aggregates["enforcement_mechanisms"], limit=4)
    frame_stats = _digest_to_frame_stats(aggregates["frames"], limit=4)
    key_institutions = _unique_preserving_order(
        [entry["label"] for entry in aggregates["institutions"]]
    )[:4]
    key_sources = _select_key_sources(documents)
    confidence = round(
        sum(
            (
                item.analysis.policy_extraction.confidence
                + item.analysis.risk_framing.frame_confidence.get(
                    item.analysis.risk_framing.dominant_frame,
                    0.0,
                )
            )
            / 2
            for item in documents
        )
        / len(documents),
        3,
    )
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return JurisdictionAnalysis(
        jurisdiction=jurisdiction,
        analysis_method=JURISDICTION_ANALYSIS_METHOD,
        analysis_version=JURISDICTION_ANALYSIS_VERSION,
        generated_at=generated_at,
        source_count=len(documents),
        source_document_ids=sorted(item.parsed_record.document_id for item in documents),
        source_window_start=digest["source_window_start"],
        source_window_end=digest["source_window_end"],
        summary=_jurisdiction_summary_text(
            jurisdiction=jurisdiction,
            binding_stats=binding_stats,
            frame_stats=frame_stats,
            requirement_stats=requirement_stats,
            key_institutions=key_institutions,
        ),
        governance_posture=_governance_posture_text(
            binding_stats=binding_stats,
            document_type_stats=document_type_stats,
            key_institutions=key_institutions,
        ),
        framing_landscape=_framing_landscape_text(frame_stats=frame_stats),
        implementation_and_enforcement=_implementation_text(
            requirement_stats=requirement_stats,
            enforcement_stats=enforcement_stats,
        ),
        source_coverage_note=_source_coverage_text(
            digest=digest,
            document_type_stats=document_type_stats,
            binding_stats=binding_stats,
        ),
        key_sources=key_sources,
        top_document_types=document_type_stats,
        top_binding_strengths=binding_stats,
        top_requirements=requirement_stats,
        top_enforcement_mechanisms=enforcement_stats,
        top_frames=frame_stats,
        key_institutions=key_institutions,
        confidence=confidence,
    )


def _sorted_dates(values: list[str]) -> list[str]:
    return sorted(values, key=lambda value: (_date_sort_key(value), value))


def _date_sort_key(value: str | None) -> tuple[int, int, int, str]:
    if not value:
        return (0, 0, 0, "")
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            parsed = datetime.strptime(value, fmt)
            return (parsed.year, parsed.month, parsed.day, value)
        except ValueError:
            continue
    return (0, 0, 0, value)


def _counter_to_digest(
    counter: Counter[str],
    denominator: int,
    *,
    sort_order: dict[str, int] | None = None,
) -> list[dict[str, Any]]:
    items = sorted(
        counter.items(),
        key=lambda item: (
            -(item[1]),
            sort_order.get(item[0], 999) if sort_order else 999,
            item[0],
        ),
    )
    return [
        {
            "label": label,
            "count": count,
            "share": round(count / denominator, 3) if denominator else 0.0,
        }
        for label, count in items
    ]


def _frame_digest(
    frame_score_totals: dict[str, float],
    frame_document_mentions: Counter[str],
) -> list[dict[str, Any]]:
    total_score = sum(frame_score_totals.values()) or 1.0
    items = sorted(
        frame_score_totals.items(),
        key=lambda item: (-item[1], item[0]),
    )
    return [
        {
            "label": label,
            "score": round(score, 3),
            "share": round(score / total_score, 3),
            "document_mentions": frame_document_mentions.get(label, 0),
        }
        for label, score in items
    ]


def _digest_to_label_stats(
    entries: list[dict[str, Any]],
    *,
    limit: int,
) -> list[JurisdictionLabelStat]:
    return [
        JurisdictionLabelStat.model_validate(entry)
        for entry in entries[:limit]
    ]


def _digest_to_frame_stats(
    entries: list[dict[str, Any]],
    *,
    limit: int,
) -> list[JurisdictionFrameStat]:
    return [
        JurisdictionFrameStat.model_validate(entry)
        for entry in entries[:limit]
    ]


def _jurisdiction_summary_text(
    *,
    jurisdiction: str,
    binding_stats: list[JurisdictionLabelStat],
    frame_stats: list[JurisdictionFrameStat],
    requirement_stats: list[JurisdictionLabelStat],
    key_institutions: list[str],
) -> str:
    name = JURISDICTION_DISPLAY_NAMES.get(jurisdiction, jurisdiction.replace("_", " ").title())
    possessive_name = _possessive_name(name)
    institution_phrase = _join_text(key_institutions[:2]) or "official institutions"
    frame_phrase = _frame_summary_phrase(frame_stats)
    requirement_phrase = _join_text(
        [_humanize_label(item.label) for item in requirement_stats[:3]]
    ) or "operational safeguards"
    return (
        f"{possessive_name} current AI governance record is {_binding_posture_phrase(binding_stats)}, "
        f"with {institution_phrase} appearing most often in the source base. "
        f"Across the analyzed documents, {frame_phrase}, while {requirement_phrase} recur most often "
        "in the operative expectations."
    )


def _governance_posture_text(
    *,
    binding_stats: list[JurisdictionLabelStat],
    document_type_stats: list[JurisdictionLabelStat],
    key_institutions: list[str],
) -> str:
    binding_lead = binding_stats[0] if binding_stats else None
    doc_types = _join_text([_humanize_document_type(item.label) for item in document_type_stats[:2]])
    institutions = _join_text(key_institutions[:3]) or "official institutions"
    if binding_lead is None:
        return "The current corpus is too thin to characterize the jurisdiction's governance posture."
    if binding_lead.label == "binding_law":
        opener = "The source base is anchored in binding instruments rather than strategy statements alone."
    elif binding_lead.label in {"regulatory_guidance", "standards_guideline"}:
        opener = "The source base is guidance-heavy, so implementation detail appears more often than hard-edged statutory obligations."
    elif binding_lead.label == "executive_action":
        opener = "Executive action is doing much of the coordination work in the current source base."
    else:
        opener = "The jurisdiction currently reads as a mixed stack of strategy, guidance, and selective binding measures."
    return f"{opener} The strongest institutional signals come from {institutions}, and the corpus is weighted toward {doc_types or 'official AI governance materials'}."


def _framing_landscape_text(*, frame_stats: list[JurisdictionFrameStat]) -> str:
    if not frame_stats:
        return "The available sources do not yet provide a stable framing picture."
    dominant = frame_stats[0]
    secondary = frame_stats[1] if len(frame_stats) > 1 else None
    tertiary = frame_stats[2] if len(frame_stats) > 2 else None
    dominant_text = FRAME_LABELS.get(dominant.label, dominant.label)
    if secondary and secondary.share >= dominant.share * 0.75:
        return (
            f"The framing mix is relatively split: {dominant_text} leads, but {FRAME_LABELS.get(secondary.label, secondary.label)} "
            "is close enough that the jurisdiction should not be read through a single rationale alone."
        )
    secondary_bits = [
        FRAME_LABELS.get(entry.label, entry.label)
        for entry in (secondary, tertiary)
        if entry is not None
    ]
    tail = _join_text(secondary_bits)
    if tail:
        return f"{dominant_text} is the clearest rationale in the corpus, with {tail} still materially shaping how governance is justified."
    return f"{dominant_text} is the clearest rationale in the current corpus."


def _implementation_text(
    *,
    requirement_stats: list[JurisdictionLabelStat],
    enforcement_stats: list[JurisdictionLabelStat],
) -> str:
    requirements = _join_text([_humanize_label(item.label) for item in requirement_stats[:3]])
    if not enforcement_stats:
        return f"Operationally, the sources most often point to {requirements or 'AI governance safeguards'}, but explicit enforcement hooks remain sparse in the current corpus."
    lead_enforcement = enforcement_stats[0]
    enforcement_phrase = _join_text([_humanize_label(item.label) for item in enforcement_stats[:2]])
    if lead_enforcement.label in {"soft_enforcement", "none_specified"}:
        return (
            f"Operationally, the sources most often point to {requirements or 'AI governance safeguards'}. "
            f"Enforcement language is comparatively soft and usually framed through {enforcement_phrase} rather than hard sanctions."
        )
    return (
        f"Operationally, the sources most often point to {requirements or 'AI governance safeguards'}. "
        f"When the corpus gets concrete about consequences, it most often references {enforcement_phrase}."
    )


def _source_coverage_text(
    *,
    digest: dict[str, Any],
    document_type_stats: list[JurisdictionLabelStat],
    binding_stats: list[JurisdictionLabelStat],
) -> str:
    source_count = digest["source_count"]
    window_start = digest["source_window_start"]
    window_end = digest["source_window_end"]
    latest_titles = [
        document["title"]
        for document in sorted(
            digest["documents"],
            key=lambda item: (_date_sort_key(item.get("publication_date")), item["document_id"]),
            reverse=True,
        )[:2]
    ]
    doc_type_phrase = _join_text([_humanize_document_type(item.label) for item in document_type_stats[:2]])
    binding_phrase = _join_text([_humanize_binding(item.label) for item in binding_stats[:2]])
    coverage_window = f"{window_start} to {window_end}" if window_start and window_end else "the current source window"
    latest_phrase = _join_text(latest_titles)
    sentence = (
        f"This readout is based on {source_count} analyzed documents spanning {coverage_window}. "
        f"The corpus is weighted toward {doc_type_phrase or 'official governance materials'}. "
        f"On the binding side it leans toward {binding_phrase or 'current official instruments'}, "
        "so it captures official policy posture more directly than downstream enforcement practice."
    )
    if latest_phrase:
        sentence += f" The most recent additions in the current mix are {latest_phrase}."
    return sentence


def _binding_posture_phrase(binding_stats: list[JurisdictionLabelStat]) -> str:
    if not binding_stats:
        return "still too thin to characterize"
    lead = binding_stats[0]
    if lead.label == "binding_law" and lead.share >= 0.4:
        return "law- and regulator-centered"
    if lead.label in {"regulatory_guidance", "standards_guideline"} and lead.share >= 0.4:
        return "guidance-heavy"
    if lead.label in {"strategy_statement", "voluntary_commitment"} and lead.share >= 0.4:
        return "strategy- and soft-law oriented"
    if lead.label == "executive_action" and lead.share >= 0.35:
        return "executive-action led"
    return "mixed across law, guidance, and strategic coordination"


def _frame_summary_phrase(frame_stats: list[JurisdictionFrameStat]) -> str:
    if not frame_stats:
        return "the source base does not yet show a stable framing pattern"
    dominant = frame_stats[0]
    secondary = frame_stats[1] if len(frame_stats) > 1 else None
    if secondary and secondary.share >= dominant.share * 0.75:
        return (
            f"{FRAME_LABELS.get(dominant.label, dominant.label)} and "
            f"{FRAME_LABELS.get(secondary.label, secondary.label)} both materially shape the jurisdiction's rationale"
        )
    if secondary:
        return (
            f"{FRAME_LABELS.get(dominant.label, dominant.label)} is the clearest rationale, "
            f"with {FRAME_LABELS.get(secondary.label, secondary.label)} as the next strongest layer"
        )
    return f"{FRAME_LABELS.get(dominant.label, dominant.label)} is the clearest rationale"


def _select_key_sources(
    documents: list[JurisdictionDocumentRecord],
    *,
    limit: int = 4,
) -> list[JurisdictionSourceReference]:
    dated_documents = [item for item in documents if item.publication_date]
    sorted_dates = _sorted_dates([item.publication_date for item in dated_documents if item.publication_date])
    earliest = _date_sort_key(sorted_dates[0])[0] if sorted_dates else 0
    latest = _date_sort_key(sorted_dates[-1])[0] if sorted_dates else 0
    span = max(latest - earliest, 1)

    ranked = sorted(
        documents,
        key=lambda item: _source_salience(item, earliest_year=earliest, span_years=span),
        reverse=True,
    )
    return [
        JurisdictionSourceReference(
            document_id=item.parsed_record.document_id,
            title=item.analysis.title,
            publication_date=item.publication_date,
            document_type=item.analysis.policy_extraction.document_type,
            binding_strength=item.analysis.policy_extraction.binding_strength,
            dominant_frame=item.analysis.risk_framing.dominant_frame,
            contribution=_source_contribution(item),
        )
        for item in ranked[:limit]
    ]


def _source_salience(
    item: JurisdictionDocumentRecord,
    *,
    earliest_year: int,
    span_years: int,
) -> float:
    extraction = item.analysis.policy_extraction
    framing = item.analysis.risk_framing
    base = SOURCE_SALIENCE_WEIGHT.get(extraction.binding_strength, 2.0)
    richness = (
        min(len(extraction.safety_requirements), 4) * 0.35
        + min(len(extraction.enforcement_mechanisms), 3) * 0.35
    )
    frame_signal = framing.frame_confidence.get(framing.dominant_frame, 0.0)
    recency = 0.0
    if item.publication_date:
        year = _date_sort_key(item.publication_date)[0]
        if year:
            recency = ((year - earliest_year) / span_years) * 1.2
    return base + richness + frame_signal + recency


def _source_contribution(item: JurisdictionDocumentRecord) -> str:
    extraction = item.analysis.policy_extraction
    framing = item.analysis.risk_framing
    prefix_map = {
        "binding_law": "Statutory anchor",
        "executive_action": "Executive coordination anchor",
        "regulatory_guidance": "Regulatory implementation anchor",
        "standards_guideline": "Standards and practice anchor",
        "voluntary_commitment": "Soft-law signal",
        "strategy_statement": "Strategic direction anchor",
    }
    requirements = [_humanize_label(requirement.label) for requirement in extraction.safety_requirements[:2]]
    mechanisms = [
        _humanize_label(mechanism.label)
        for mechanism in extraction.enforcement_mechanisms[:1]
        if mechanism.label != "none_specified"
    ]
    if requirements:
        focus = f"for {_join_text(requirements)}"
    else:
        focus = f"for the {FRAME_LABELS.get(framing.dominant_frame, framing.dominant_frame).lower()} rationale"
    if mechanisms:
        return f"{prefix_map.get(extraction.binding_strength, 'Key source')} {focus}, with {mechanisms[0]} as the clearest consequence or oversight hook."
    return f"{prefix_map.get(extraction.binding_strength, 'Key source')} {focus}."


def _join_text(values: list[str]) -> str:
    filtered = _unique_preserving_order([value for value in values if value])
    if not filtered:
        return ""
    if len(filtered) == 1:
        return filtered[0]
    if len(filtered) == 2:
        return f"{filtered[0]} and {filtered[1]}"
    return f"{', '.join(filtered[:-1])}, and {filtered[-1]}"


def _humanize_document_type(label: str) -> str:
    return DOCUMENT_TYPE_LABELS.get(label, label.replace("_", " "))


def _humanize_binding(label: str) -> str:
    return BINDING_STRENGTH_LABELS.get(label, label.replace("_", " "))


def _humanize_label(label: str) -> str:
    return LABEL_TEXT.get(label, label.replace("_", " "))


def _possessive_name(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def _unique_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def _non_whitespace_length(value: str) -> int:
    return len("".join(value.split()))


def _analysis_fidelity_issue(record: ParsedDocumentRecord) -> str | None:
    warnings = set(record.parsed_document.warnings)
    matched = sorted(warnings & LOW_FIDELITY_PARSER_WARNINGS)
    if matched:
        return ",".join(matched)

    plain_text_len = _non_whitespace_length(record.parsed_document.plain_text)
    substantive_sections = sum(
        1
        for section in record.parsed_document.sections
        if _non_whitespace_length(section.content) >= MIN_SUBSTANTIVE_SECTION_CHARS
    )
    if plain_text_len < MIN_ANALYSIS_NON_WHITESPACE_CHARS and substantive_sections == 0:
        return f"thin_parsed_text:{plain_text_len}"
    return None


def analyze_parsed_documents(
    *,
    jurisdiction: str | None = None,
    document_id: str | None = None,
    store: AnalysisStore | None = None,
    client: StructuredOutputClient | None = None,
    refresh_existing: bool = False,
) -> list[dict[str, str]]:
    records = _load_parsed_document_records(jurisdiction=jurisdiction, document_id=document_id)
    if not records:
        raise ValueError("no parsed documents matched the requested filters")

    if client is None:
        client = ClaudeAPIClient()
    if store is None and os.getenv("DATABASE_URL"):
        store = PostgresAnalysisStore()

    policy_schema = _policy_extraction_schema()
    metadata_schema = _policy_metadata_schema()
    controls_schema = _policy_controls_schema()
    framing_schema = _risk_framing_schema()
    metadata_system_prompt = _build_task_system_prompt(
        "structured_extraction.md",
        metadata_schema,
        focus_instructions=(
            "Extract only the document-level policy metadata, scope, dates, authorities, deadlines, "
            "and implementation notes. Do not include safety requirement or enforcement mechanism arrays."
        ),
    )
    controls_system_prompt = _build_task_system_prompt(
        "structured_extraction.md",
        controls_schema,
        focus_instructions=(
            "Extract only the named safety requirements and enforcement mechanisms. "
            "Use conservative labels and provide short evidence spans for each item."
        ),
    )
    framing_system_prompt = _build_task_system_prompt(
        "risk_framing_analysis.md",
        framing_schema,
        focus_instructions=(
            "Focus on the document's stated reasons for AI governance, especially rights, security, "
            "competition, innovation, public-order, and societal-risk language."
        ),
    )

    results: list[dict[str, str]] = []
    touched_jurisdictions: set[str] = set()
    for record in records:
        target_dir = ANALYSIS_DIR / record.jurisdiction / record.document_id
        if not refresh_existing and (target_dir / "document_analysis.json").exists():
            results.append(
                {
                    "jurisdiction": record.jurisdiction,
                    "document_id": record.document_id,
                    "status": "skipped_existing",
                }
            )
            continue
        fidelity_issue = _analysis_fidelity_issue(record)
        if fidelity_issue is not None:
            if target_dir.exists() and refresh_existing:
                shutil.rmtree(target_dir)
            target_dir.mkdir(parents=True, exist_ok=True)
            (target_dir / "analysis_skipped.json").write_text(
                json.dumps(
                    {
                        "source_id": record.document_id,
                        "reason": "low_fidelity_input",
                        "detail": fidelity_issue,
                        "parser_warnings": record.parsed_document.warnings,
                        "plain_text_non_whitespace_chars": _non_whitespace_length(record.parsed_document.plain_text),
                    },
                    indent=2,
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            results.append(
                {
                    "jurisdiction": record.jurisdiction,
                    "document_id": record.document_id,
                    "status": "skipped_low_fidelity",
                }
            )
            continue
        metadata_prompt = _build_user_prompt(
            record,
            excerpt=_build_analysis_excerpt(
                record,
                keywords=POLICY_METADATA_KEYWORDS,
                max_chars=POLICY_METADATA_MAX_CHARS,
            ),
            task_label="policy_metadata",
        )
        controls_prompt = _build_user_prompt(
            record,
            excerpt=_build_analysis_excerpt(
                record,
                keywords=POLICY_CONTROLS_KEYWORDS,
                max_chars=POLICY_CONTROLS_MAX_CHARS,
            ),
            task_label="policy_controls",
        )
        framing_prompt = _build_user_prompt(
            record,
            excerpt=_build_analysis_excerpt(
                record,
                keywords=RISK_FRAMING_KEYWORDS,
                max_chars=RISK_FRAMING_MAX_CHARS,
            ),
            task_label="risk_framing",
        )
        try:
            metadata_payload, raw_metadata_response = client.create_json_response(
                system_prompt=metadata_system_prompt,
                user_prompt=metadata_prompt,
                schema=metadata_schema,
                max_tokens=3072,
            )
            controls_payload, raw_controls_response = client.create_json_response(
                system_prompt=controls_system_prompt,
                user_prompt=controls_prompt,
                schema=controls_schema,
                max_tokens=4096,
            )
            framing_payload, raw_framing_response = client.create_json_response(
                system_prompt=framing_system_prompt,
                user_prompt=framing_prompt,
                schema=framing_schema,
                max_tokens=3072,
            )
            metadata_extraction = PolicyMetadataExtraction.model_validate(metadata_payload)
            controls_extraction = PolicyControlsExtraction.model_validate(controls_payload)
            extraction = PolicyExtraction(
                jurisdiction=record.jurisdiction,
                issuing_body=metadata_extraction.issuing_body,
                document_type=metadata_extraction.document_type,
                binding_strength=metadata_extraction.binding_strength,
                publication_date=metadata_extraction.publication_date,
                effective_date=metadata_extraction.effective_date,
                covered_actors=metadata_extraction.covered_actors,
                covered_application_domains=metadata_extraction.covered_application_domains,
                prohibited_practices=metadata_extraction.prohibited_practices,
                safety_requirements=controls_extraction.safety_requirements,
                enforcement_mechanisms=controls_extraction.enforcement_mechanisms,
                enforcement_authorities=metadata_extraction.enforcement_authorities,
                compliance_deadlines=metadata_extraction.compliance_deadlines,
                penalties_summary=metadata_extraction.penalties_summary,
                implementation_notes=metadata_extraction.implementation_notes,
                confidence=metadata_extraction.confidence,
            )
            framing = RiskFramingAnalysis.model_validate(framing_payload)
            _validate_taxonomy_alignment(extraction, framing)
        except (ValidationError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
            results.append(
                {
                    "jurisdiction": record.jurisdiction,
                    "document_id": record.document_id,
                    "status": f"analysis_error:{type(exc).__name__}",
                }
            )
            continue

        analysis = DocumentAnalysis(
            source_id=record.document_id,
            title=record.raw_metadata.get("title", record.parsed_document.title),
            language=_primary_language(record),
            policy_extraction=extraction,
            risk_framing=framing,
        )

        target_dir.mkdir(parents=True, exist_ok=True)

        (target_dir / "policy_extraction.json").write_text(
            extraction.model_dump_json(indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (target_dir / "risk_framing.json").write_text(
            framing.model_dump_json(indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (target_dir / "document_analysis.json").write_text(
            analysis.model_dump_json(indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (target_dir / "policy_metadata.json").write_text(
            metadata_extraction.model_dump_json(indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (target_dir / "policy_controls.json").write_text(
            controls_extraction.model_dump_json(indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (target_dir / "policy_response.raw.json").write_text(
            json.dumps(
                {
                    "metadata_response": raw_metadata_response,
                    "controls_response": raw_controls_response,
                },
                indent=2,
                ensure_ascii=False,
            )
            + "\n",
            encoding="utf-8",
        )
        (target_dir / "framing_response.raw.json").write_text(
            json.dumps(raw_framing_response, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        if store is not None:
            try:
                bundle = build_analysis_persistence_bundle(
                    document_id=record.document_id,
                    jurisdiction=record.jurisdiction,
                    title=record.raw_metadata.get("title", record.parsed_document.title),
                    canonical_url=_source_url(record),
                    language=_primary_language(record),
                    parser_version=record.parsed_document.parser_version,
                    raw_artifact_path=record.parsed_document.source_artifact_path,
                    normalized_text_path=str(record.parsed_path),
                    normalized_text=record.parsed_document.plain_text,
                    raw_metadata=record.raw_metadata,
                    provider=getattr(client, "provider", "custom"),
                    model=getattr(client, "model", "unknown"),
                    effort=getattr(client, "effort", None),
                    extraction_prompt=f"{metadata_system_prompt}\n\n---\n\n{controls_system_prompt}",
                    framing_prompt=framing_system_prompt,
                    extraction=extraction,
                    framing=framing,
                    raw_policy_response={
                        "metadata_response": raw_metadata_response,
                        "controls_response": raw_controls_response,
                    },
                    raw_framing_response=raw_framing_response,
                )
                store.persist_analysis_bundle(bundle)
            except Exception as exc:
                results.append(
                    {
                        "jurisdiction": record.jurisdiction,
                        "document_id": record.document_id,
                        "status": f"persist_error:{type(exc).__name__}",
                    }
                )
                continue

        results.append(
            {
                "jurisdiction": record.jurisdiction,
                "document_id": record.document_id,
                "status": "analyzed",
            }
        )
        touched_jurisdictions.add(record.jurisdiction)

    for touched_jurisdiction in sorted(touched_jurisdictions):
        results.extend(
            analyze_jurisdictions(
                jurisdiction=touched_jurisdiction,
                store=store,
                refresh_existing=True,
            )
        )

    return results


def persist_analysis_artifacts(
    *,
    jurisdiction: str | None = None,
    document_id: str | None = None,
    store: AnalysisStore | None = None,
) -> list[dict[str, str]]:
    records = _load_parsed_document_records(jurisdiction=jurisdiction, document_id=document_id)
    if not records:
        raise ValueError("no parsed documents matched the requested filters")

    if store is None:
        store = PostgresAnalysisStore()

    metadata_schema = _policy_metadata_schema()
    controls_schema = _policy_controls_schema()
    framing_schema = _risk_framing_schema()
    metadata_system_prompt = _build_task_system_prompt(
        "structured_extraction.md",
        metadata_schema,
        focus_instructions=(
            "Extract only the document-level policy metadata, scope, dates, authorities, deadlines, "
            "and implementation notes. Do not include safety requirement or enforcement mechanism arrays."
        ),
    )
    controls_system_prompt = _build_task_system_prompt(
        "structured_extraction.md",
        controls_schema,
        focus_instructions=(
            "Extract only the named safety requirements and enforcement mechanisms. "
            "Use conservative labels and provide short evidence spans for each item."
        ),
    )
    framing_system_prompt = _build_task_system_prompt("risk_framing_analysis.md", framing_schema, focus_instructions="")

    results: list[dict[str, str]] = []
    touched_jurisdictions: set[str] = set()
    for record in records:
        try:
            analysis, raw_policy_response, raw_framing_response = _load_analysis_artifacts(record)
            extraction = analysis.policy_extraction
            framing = analysis.risk_framing
            _validate_taxonomy_alignment(extraction, framing)
            provider, model, effort = _artifact_runtime_metadata(
                raw_policy_response=raw_policy_response,
                raw_framing_response=raw_framing_response,
            )
            bundle = build_analysis_persistence_bundle(
                document_id=record.document_id,
                jurisdiction=record.jurisdiction,
                title=record.raw_metadata.get("title", record.parsed_document.title),
                canonical_url=_source_url(record),
                language=_primary_language(record),
                parser_version=record.parsed_document.parser_version,
                raw_artifact_path=record.parsed_document.source_artifact_path,
                normalized_text_path=str(record.parsed_path),
                normalized_text=record.parsed_document.plain_text,
                raw_metadata=record.raw_metadata,
                provider=provider,
                model=model,
                effort=effort,
                extraction_prompt=f"{metadata_system_prompt}\n\n---\n\n{controls_system_prompt}",
                framing_prompt=framing_system_prompt,
                extraction=extraction,
                framing=framing,
                raw_policy_response=raw_policy_response,
                raw_framing_response=raw_framing_response,
            )
            store.persist_analysis_bundle(bundle)
        except (ValidationError, ValueError, RuntimeError, json.JSONDecodeError, OSError) as exc:
            results.append(
                {
                    "jurisdiction": record.jurisdiction,
                    "document_id": record.document_id,
                    "status": f"persist_error:{type(exc).__name__}",
                }
            )
            continue

        results.append(
            {
                "jurisdiction": record.jurisdiction,
                "document_id": record.document_id,
                "status": "persisted",
            }
        )
        touched_jurisdictions.add(record.jurisdiction)

    for touched_jurisdiction in sorted(touched_jurisdictions):
        results.extend(
            analyze_jurisdictions(
                jurisdiction=touched_jurisdiction,
                store=store,
                refresh_existing=True,
            )
        )

    return results


def _load_analysis_artifacts(
    record: ParsedDocumentRecord,
) -> tuple[DocumentAnalysis, dict[str, Any], dict[str, Any]]:
    analysis_dir = ANALYSIS_DIR / record.jurisdiction / record.document_id
    document_analysis_path = analysis_dir / "document_analysis.json"
    policy_response_path = analysis_dir / "policy_response.raw.json"
    framing_response_path = analysis_dir / "framing_response.raw.json"

    if document_analysis_path.exists():
        with document_analysis_path.open("r", encoding="utf-8") as handle:
            analysis_payload = json.load(handle)
        analysis = DocumentAnalysis.model_validate(analysis_payload)
    else:
        policy_path = analysis_dir / "policy_extraction.json"
        framing_path = analysis_dir / "risk_framing.json"
        if not policy_path.exists() or not framing_path.exists():
            raise ValueError("analysis artifacts not found")
        with policy_path.open("r", encoding="utf-8") as handle:
            policy_payload = json.load(handle)
        with framing_path.open("r", encoding="utf-8") as handle:
            framing_payload = json.load(handle)
        analysis = DocumentAnalysis(
            source_id=record.document_id,
            title=record.raw_metadata.get("title", record.parsed_document.title),
            language=_primary_language(record),
            policy_extraction=PolicyExtraction.model_validate(policy_payload),
            risk_framing=RiskFramingAnalysis.model_validate(framing_payload),
        )

    raw_policy_response = _load_optional_json(policy_response_path)
    raw_framing_response = _load_optional_json(framing_response_path)
    return analysis, raw_policy_response, raw_framing_response


def _load_optional_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object in {path}")
    return payload


def _artifact_runtime_metadata(
    *,
    raw_policy_response: dict[str, Any],
    raw_framing_response: dict[str, Any],
) -> tuple[str, str, str | None]:
    model = _first_string(
        raw_policy_response.get("model"),
        raw_framing_response.get("model"),
    ) or "artifact-replay"
    provider = _first_string(
        raw_policy_response.get("provider"),
        raw_framing_response.get("provider"),
    )
    if provider is None:
        provider = "anthropic" if model.startswith("claude") else "artifact-replay"

    effort = _first_string(
        raw_policy_response.get("effort"),
        raw_framing_response.get("effort"),
    )
    if effort is None and provider == "anthropic":
        effort = os.getenv("ANTHROPIC_EFFORT", DEFAULT_EFFORT)

    return provider, model, effort


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value:
            return value
    return None
