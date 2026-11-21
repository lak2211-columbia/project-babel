from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


VALID_GROUNDING_STATUSES = {"verbatim", "approximate", "not_found"}


class StrictBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EvidenceSpan(StrictBaseModel):
    quote: str = Field(min_length=1)
    source_section: Optional[str] = None
    quote_en: Optional[str] = None
    frame: Optional[str] = None
    grounding_status: Optional[str] = None
    start_char: Optional[int] = Field(default=None, ge=0)
    end_char: Optional[int] = Field(default=None, ge=0)

    @field_validator("grounding_status")
    @classmethod
    def validate_grounding_status(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in VALID_GROUNDING_STATUSES:
            raise ValueError(f"grounding_status must be one of {sorted(VALID_GROUNDING_STATUSES)}")
        return value


class SafetyRequirement(StrictBaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    obligation_strength: Optional[str] = None
    evidence: List[EvidenceSpan] = Field(min_length=1)


# Alias for schema/codebook clarity (backwards-compatible with SafetyRequirement).
PolicyRequirementRecord = SafetyRequirement


class EnforcementMechanism(StrictBaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: List[EvidenceSpan] = Field(min_length=1)


class PolicyExtraction(StrictBaseModel):
    jurisdiction: str
    issuing_body: str
    document_type: str
    binding_strength: str
    publication_date: Optional[str] = None
    effective_date: Optional[str] = None
    covered_actors: List[str] = Field(default_factory=list)
    covered_application_domains: List[str] = Field(default_factory=list)
    prohibited_practices: List[str] = Field(default_factory=list)
    safety_requirements: List[SafetyRequirement] = Field(default_factory=list)
    enforcement_mechanisms: List[EnforcementMechanism] = Field(default_factory=list)
    enforcement_authorities: List[str] = Field(default_factory=list)
    compliance_deadlines: List[str] = Field(default_factory=list)
    penalties_summary: Optional[str] = None
    implementation_notes: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)


class RiskFramingAnalysis(StrictBaseModel):
    dominant_frame: str
    secondary_frames: List[str] = Field(default_factory=list)
    frame_confidence: Dict[str, float] = Field(default_factory=dict)
    frame_share: Optional[Dict[str, float]] = None
    rationale_summary: str
    evidence_spans: List[EvidenceSpan] = Field(default_factory=list)

    @field_validator("frame_confidence")
    @classmethod
    def validate_frame_confidence_bounds(cls, value: Dict[str, float]) -> Dict[str, float]:
        for frame, score in value.items():
            if not isinstance(score, (int, float)) or score != score:  # NaN check
                raise ValueError(f"frame_confidence score for '{frame}' must be a valid number")
            if score < 0.0 or score > 1.0:
                raise ValueError(f"frame_confidence score for '{frame}' must be between 0.0 and 1.0")
        return value

    @field_validator("frame_share")
    @classmethod
    def validate_frame_share_bounds(cls, value: Optional[Dict[str, float]]) -> Optional[Dict[str, float]]:
        if value is None:
            return None
        total = 0.0
        for frame, share in value.items():
            if not isinstance(share, (int, float)) or share != share:
                raise ValueError(f"frame_share value for '{frame}' must be a valid number")
            if share < 0.0 or share > 1.0:
                raise ValueError(f"frame_share value for '{frame}' must be between 0.0 and 1.0")
            total += float(share)
        if value and total > 1e-6 and abs(total - 1.0) > 0.05:
            raise ValueError(f"frame_share values must sum to ~1.0 (got {total:.4f})")
        return value


class AnalysisProvenance(StrictBaseModel):
    provider: str
    model: str
    effort: Optional[str] = None
    temperature: Optional[float] = None
    analyzed_at: Optional[str] = None
    analysis_version: str
    taxonomy_version: str
    taxonomy_hash: str
    extraction_prompt_hash: str
    framing_prompt_hash: str
    input_sha256: str
    chunked: bool = False
    chunk_count: int = 1
    usage: Dict[str, Any] = Field(default_factory=dict)
    grounding_summary: Optional[Dict[str, Any]] = None


class DocumentAnalysis(StrictBaseModel):
    source_id: str
    title: str
    language: str
    policy_extraction: PolicyExtraction
    risk_framing: RiskFramingAnalysis
    analysis_metadata: Optional[AnalysisProvenance] = None


class JurisdictionLabelStat(StrictBaseModel):
    label: str
    count: int = Field(ge=0)
    share: float = Field(ge=0.0, le=1.0)


class JurisdictionFrameStat(StrictBaseModel):
    label: str
    score: float = Field(ge=0.0)
    share: float = Field(ge=0.0, le=1.0)
    document_mentions: int = Field(ge=0)


class JurisdictionSourceReference(StrictBaseModel):
    document_id: str
    title: str
    publication_date: Optional[str] = None
    document_type: Optional[str] = None
    binding_strength: Optional[str] = None
    dominant_frame: Optional[str] = None
    contribution: str


class JurisdictionAnalysis(StrictBaseModel):
    jurisdiction: str
    analysis_method: str
    analysis_version: str
    generated_at: str
    source_count: int = Field(ge=0)
    source_document_ids: List[str] = Field(default_factory=list)
    source_window_start: Optional[str] = None
    source_window_end: Optional[str] = None
    summary: str
    governance_posture: str
    framing_landscape: str
    implementation_and_enforcement: str
    source_coverage_note: str
    key_sources: List[JurisdictionSourceReference] = Field(default_factory=list)
    top_document_types: List[JurisdictionLabelStat] = Field(default_factory=list)
    top_binding_strengths: List[JurisdictionLabelStat] = Field(default_factory=list)
    top_requirements: List[JurisdictionLabelStat] = Field(default_factory=list)
    top_enforcement_mechanisms: List[JurisdictionLabelStat] = Field(default_factory=list)
    top_frames: List[JurisdictionFrameStat] = Field(default_factory=list)
    key_institutions: List[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
