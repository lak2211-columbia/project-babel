from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Protocol

from observatory.models import JurisdictionAnalysis, PolicyExtraction, RiskFramingAnalysis
from observatory.taxonomy import load_taxonomy


PIPELINE_ANALYSIS_VERSION = "0.1.0"


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
    provider: str,
    model: str,
    effort: str | None,
    extraction_prompt: str,
    framing_prompt: str,
    extraction: PolicyExtraction,
    framing: RiskFramingAnalysis,
    raw_policy_response: dict[str, Any],
    raw_framing_response: dict[str, Any],
) -> AnalysisPersistenceBundle:
    taxonomy_hash = _stable_hash(load_taxonomy())
    extraction_prompt_hash = _stable_hash(extraction_prompt)
    framing_prompt_hash = _stable_hash(framing_prompt)
    dominant_frame_confidence = framing.frame_confidence.get(framing.dominant_frame, 0.0)
    overall_confidence = round((extraction.confidence + dominant_frame_confidence) / 2, 3)

    fingerprint_payload = {
        "document_id": document_id,
        "jurisdiction": jurisdiction,
        "model": model,
        "effort": effort,
        "parser_version": parser_version,
        "taxonomy_hash": taxonomy_hash,
        "extraction_prompt_hash": extraction_prompt_hash,
        "framing_prompt_hash": framing_prompt_hash,
        "policy_extraction": extraction.model_dump(mode="json"),
        "risk_framing": framing.model_dump(mode="json"),
    }

    resolved_publication_date = _resolve_metadata_date(
        raw_metadata,
        primary_key="publication_date",
        fallback=extraction.publication_date,
    )
    resolved_effective_date = _resolve_metadata_date(
        raw_metadata,
        primary_key="effective_date",
        fallback=extraction.effective_date,
    )

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
        raw_artifact_path=raw_artifact_path,
        normalized_text_path=normalized_text_path,
        normalized_text=normalized_text,
        raw_metadata=raw_metadata,
        provider=provider,
        model=model,
        effort=effort,
        analysis_version=PIPELINE_ANALYSIS_VERSION,
        analysis_fingerprint=_stable_hash(fingerprint_payload),
        taxonomy_hash=taxonomy_hash,
        extraction_prompt_hash=extraction_prompt_hash,
        framing_prompt_hash=framing_prompt_hash,
        policy_extraction=extraction.model_dump(mode="json"),
        risk_framing=framing.model_dump(mode="json"),
        raw_policy_response=raw_policy_response,
        raw_framing_response=raw_framing_response,
        overall_confidence=overall_confidence,
        dominant_frame_confidence=dominant_frame_confidence,
    )


def build_jurisdiction_analysis_persistence_bundle(
    *,
    analysis: JurisdictionAnalysis,
    input_digest: dict[str, Any],
) -> JurisdictionAnalysisPersistenceBundle:
    taxonomy_hash = _stable_hash(load_taxonomy())
    analysis_payload = analysis.model_dump(mode="json")
    fingerprint_payload = {
        "jurisdiction": analysis.jurisdiction,
        "analysis_version": analysis.analysis_version,
        "analysis_method": analysis.analysis_method,
        "taxonomy_hash": taxonomy_hash,
        "analysis_payload": analysis_payload,
        "input_digest": input_digest,
    }
    return JurisdictionAnalysisPersistenceBundle(
        jurisdiction=analysis.jurisdiction,
        analysis_version=analysis.analysis_version,
        analysis_method=analysis.analysis_method,
        analysis_fingerprint=_stable_hash(fingerprint_payload),
        taxonomy_hash=taxonomy_hash,
        source_document_count=analysis.source_count,
        source_document_ids=analysis.source_document_ids,
        source_window_start=analysis.source_window_start,
        source_window_end=analysis.source_window_end,
        analysis_payload=analysis_payload,
        input_digest=input_digest,
        overall_confidence=analysis.confidence,
    )


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
