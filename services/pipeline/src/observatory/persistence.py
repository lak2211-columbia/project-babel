from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from observatory.models import (
    AnalysisProvenance,
    JurisdictionAnalysis,
    PolicyExtraction,
    RiskFramingAnalysis,
)
from observatory.taxonomy import load_taxonomy
from observatory.url_safety import normalize_date_for_db, repo_rel_posix


PIPELINE_ANALYSIS_VERSION = "0.3.0"
LEGACY_TAXONOMY_VERSION = "legacy"
LEGACY_ANALYSIS_VERSION = "legacy_v1"
LEGACY_TAXONOMY_HASH = "legacy"


class AnalysisStore(Protocol):
    def persist_analysis_bundle(self, bundle: "AnalysisPersistenceBundle") -> None: ...

    def persist_jurisdiction_analysis_bundle(
        self,
        bundle: "JurisdictionAnalysisPersistenceBundle",
    ) -> None: ...


@dataclass(frozen=True)
class AnalysisPersistenceBundle:
    document_id: str
    jurisdiction: str
    title: str
    canonical_url: str | None
    issuing_body: str
    language: str
    publication_date: str | None
    effective_date: str | None
    parser_version: str
    raw_artifact_path: str | None
    normalized_text_path: str
    normalized_text: str
    raw_metadata: dict[str, Any]
    provider: str
    model: str
    effort: str | None
    analysis_version: str
    analysis_fingerprint: str
    taxonomy_hash: str
    extraction_prompt_hash: str
    framing_prompt_hash: str
    policy_extraction: dict[str, Any]
    risk_framing: dict[str, Any]
    raw_policy_response: dict[str, Any]
    raw_framing_response: dict[str, Any]
    overall_confidence: float
    dominant_frame_confidence: float
    content_sha256: str = ""
    publication_date_precision: str | None = None
    binding_strength: str | None = None
    source_tier: str | None = None
    corpus_role: str | None = None
    lifecycle_stage: str | None = None
    sections: list[dict[str, Any]] = field(default_factory=list)
    parser_warnings: list[str] = field(default_factory=list)
    taxonomy_version: str = "2.1.0"
    grounding_ratio: float | None = None
    analyzed_at: str | None = None
    frame_shares: dict[str, float] | None = None
    prompt_hashes: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class JurisdictionAnalysisPersistenceBundle:
    jurisdiction: str
    analysis_version: str
    analysis_method: str
    analysis_fingerprint: str
    taxonomy_hash: str
    source_document_count: int
    source_document_ids: list[str]
    source_window_start: str | None
    source_window_end: str | None
    analysis_payload: dict[str, Any]
    input_digest: dict[str, Any]
    overall_confidence: float


def build_analysis_persistence_bundle(
    *,
    document_id: str,
    jurisdiction: str,
    title: str,
    canonical_url: str | None,
    language: str,
    parser_version: str,
    raw_artifact_path: str | None,
    normalized_text_path: str,
    normalized_text: str,
    raw_metadata: dict[str, Any],
    extraction: PolicyExtraction,
    framing: RiskFramingAnalysis,
    raw_policy_response: dict[str, Any],
    raw_framing_response: dict[str, Any],
    analysis_metadata: AnalysisProvenance | None = None,
    allow_legacy: bool = False,
    provider: str | None = None,
    model: str | None = None,
    effort: str | None = None,
    analyzed_at: str | None = None,
    binding_strength: str | None = None,
    sections: list[dict[str, Any]] | None = None,
    parser_warnings: list[str] | None = None,
    source_tier: str | None = None,
    corpus_role: str | None = None,
    lifecycle_stage: str | None = None,
    grounding_ratio: float | None = None,
) -> AnalysisPersistenceBundle:
    """Build a strictly provenance-preserving persistence bundle.

    Provenance fields (`provider`, `model`, `effort`, `analyzed_at`, `analysis_version`,
    `taxonomy_version`, `taxonomy_hash`, `extraction_prompt_hash`, `framing_prompt_hash`,
    and `content_sha256`) are taken strictly from `analysis_metadata`. Artifacts lacking
    `analysis_metadata` are refused unless `allow_legacy=True`, in which case legacy
    sentinels are stamped without ever fabricating current prompt hashes or taxonomy versions.
    """
    if analysis_metadata is not None:
        resolved_provider = analysis_metadata.provider
        resolved_model = analysis_metadata.model
        resolved_effort = analysis_metadata.effort
        resolved_analyzed_at = analysis_metadata.analyzed_at
        resolved_analysis_version = analysis_metadata.analysis_version
        resolved_taxonomy_version = analysis_metadata.taxonomy_version
        resolved_taxonomy_hash = analysis_metadata.taxonomy_hash
        extraction_prompt_hash = analysis_metadata.extraction_prompt_hash
        framing_prompt_hash = analysis_metadata.framing_prompt_hash
        prompt_hashes = {
            "extraction": extraction_prompt_hash,
            "framing": framing_prompt_hash,
        }
        content_sha256 = (
            analysis_metadata.input_sha256
            or hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()
        )
    elif allow_legacy:
        resolved_provider = provider or "artifact-replay"
        resolved_model = model or "artifact-replay"
        resolved_effort = effort
        resolved_analyzed_at = analyzed_at
        resolved_analysis_version = LEGACY_ANALYSIS_VERSION
        resolved_taxonomy_version = LEGACY_TAXONOMY_VERSION
        resolved_taxonomy_hash = LEGACY_TAXONOMY_HASH
        extraction_prompt_hash = ""
        framing_prompt_hash = ""
        prompt_hashes = {}
        content_sha256 = hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()
    else:
        raise ValueError(
            f"refusing to persist analysis for '{document_id}' without analysis_metadata; "
            "re-run analyze-documents or pass --allow-legacy"
        )

    dominant_frame_confidence = framing.frame_confidence.get(framing.dominant_frame, 0.0)
    overall_confidence = round((extraction.confidence + dominant_frame_confidence) / 2, 3)

    fingerprint_payload = {
        "document_id": document_id,
        "jurisdiction": jurisdiction,
        "content_sha256": content_sha256,
        "provider": resolved_provider,
        "model": resolved_model,
        "effort": resolved_effort,
        "parser_version": parser_version,
        "analysis_version": resolved_analysis_version,
        "taxonomy_version": resolved_taxonomy_version,
        "taxonomy_hash": resolved_taxonomy_hash,
        "extraction_prompt_hash": extraction_prompt_hash,
        "framing_prompt_hash": framing_prompt_hash,
        "policy_extraction": extraction.model_dump(mode="json"),
        "risk_framing": framing.model_dump(mode="json"),
    }

    raw_publication_date = _resolve_metadata_date(
        raw_metadata,
        primary_key="publication_date",
        fallback=extraction.publication_date,
    )
    resolved_publication_date, publication_date_precision = normalize_date_for_db(raw_publication_date)

    raw_effective_date = _resolve_metadata_date(
        raw_metadata,
        primary_key="effective_date",
        fallback=extraction.effective_date,
    )
    resolved_effective_date, _ = normalize_date_for_db(raw_effective_date)

    normalized_posix_path = _normalize_storage_path(normalized_text_path)
    raw_posix_path = _normalize_storage_path(raw_artifact_path) if raw_artifact_path else None

    resolved_binding_strength = binding_strength or _string_or_none(raw_metadata.get("binding_strength"))
    resolved_source_tier = source_tier or _string_or_none(raw_metadata.get("source_tier"))
    resolved_corpus_role = corpus_role or _string_or_none(raw_metadata.get("corpus_role"))
    resolved_lifecycle_stage = lifecycle_stage or _string_or_none(raw_metadata.get("lifecycle_stage"))
    resolved_frame_shares = dict(framing.frame_share) if framing.frame_share is not None else None

    return AnalysisPersistenceBundle(
        document_id=document_id,
        jurisdiction=jurisdiction,
        title=title,
        canonical_url=canonical_url,
        issuing_body=extraction.issuing_body,
        language=language,
        publication_date=resolved_publication_date,
        effective_date=resolved_effective_date,
        parser_version=parser_version,
        raw_artifact_path=raw_posix_path,
        normalized_text_path=normalized_posix_path,
        normalized_text=normalized_text,
        raw_metadata=raw_metadata,
        provider=resolved_provider,
        model=resolved_model,
        effort=resolved_effort,
        analysis_version=resolved_analysis_version,
        analysis_fingerprint=_stable_hash(fingerprint_payload),
        taxonomy_hash=resolved_taxonomy_hash,
        extraction_prompt_hash=extraction_prompt_hash,
        framing_prompt_hash=framing_prompt_hash,
        policy_extraction=extraction.model_dump(mode="json"),
        risk_framing=framing.model_dump(mode="json"),
        raw_policy_response=raw_policy_response,
        raw_framing_response=raw_framing_response,
        overall_confidence=overall_confidence,
        dominant_frame_confidence=dominant_frame_confidence,
        content_sha256=content_sha256,
        publication_date_precision=publication_date_precision,
        binding_strength=resolved_binding_strength,
        source_tier=resolved_source_tier,
        corpus_role=resolved_corpus_role,
        lifecycle_stage=resolved_lifecycle_stage,
        sections=list(sections or []),
        parser_warnings=list(parser_warnings or []),
        taxonomy_version=resolved_taxonomy_version,
        grounding_ratio=round(grounding_ratio, 3) if grounding_ratio is not None else None,
        analyzed_at=resolved_analyzed_at,
        frame_shares=resolved_frame_shares,
        prompt_hashes=prompt_hashes,
    )


def build_jurisdiction_analysis_persistence_bundle(
    *,
    analysis: JurisdictionAnalysis,
    input_digest: dict[str, Any],
) -> JurisdictionAnalysisPersistenceBundle:
    taxonomy_hash = _stable_hash(load_taxonomy())
    analysis_payload = analysis.model_dump(mode="json")
    # Exclude non-deterministic wall-clock timestamp so replays are strictly idempotent.
    deterministic_payload = {
        key: value
        for key, value in analysis_payload.items()
        if key != "generated_at"
    }
    fingerprint_payload = {
        "jurisdiction": analysis.jurisdiction,
        "analysis_version": analysis.analysis_version,
        "analysis_method": analysis.analysis_method,
        "taxonomy_hash": taxonomy_hash,
        "analysis_payload": deterministic_payload,
        "input_digest": input_digest,
    }
    window_start, _ = normalize_date_for_db(analysis.source_window_start)
    window_end, _ = normalize_date_for_db(analysis.source_window_end)
    return JurisdictionAnalysisPersistenceBundle(
        jurisdiction=analysis.jurisdiction,
        analysis_version=analysis.analysis_version,
        analysis_method=analysis.analysis_method,
        analysis_fingerprint=_stable_hash(fingerprint_payload),
        taxonomy_hash=taxonomy_hash,
        source_document_count=analysis.source_count,
        source_document_ids=analysis.source_document_ids,
        source_window_start=window_start,
        source_window_end=window_end,
        analysis_payload=analysis_payload,
        input_digest=input_digest,
        overall_confidence=analysis.confidence,
    )


def _normalize_storage_path(value: str) -> str:
    if not value:
        return value
    candidate = Path(value)
    if candidate.is_absolute():
        return repo_rel_posix(candidate)
    return value.replace("\\", "/")


def _string_or_none(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _stable_hash(payload: Any) -> str:
    if isinstance(payload, str):
        material = payload
    else:
        material = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _resolve_metadata_date(
    raw_metadata: dict[str, Any],
    *,
    primary_key: str,
    fallback: str | None,
) -> str | None:
    for key in (primary_key, f"source_{primary_key}", f"seed_{primary_key}"):
        value = raw_metadata.get(key)
        if isinstance(value, str) and value:
            return value
    return fallback
