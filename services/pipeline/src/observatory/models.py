from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class StrictBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EvidenceSpan(StrictBaseModel):
    quote: str
    source_section: Optional[str] = None


class SafetyRequirement(StrictBaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: List[EvidenceSpan] = Field(default_factory=list)


class EnforcementMechanism(StrictBaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: List[EvidenceSpan] = Field(default_factory=list)


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
    rationale_summary: str
    evidence_spans: List[EvidenceSpan] = Field(default_factory=list)


class DocumentAnalysis(StrictBaseModel):
    source_id: str
    title: str
    language: str
    policy_extraction: PolicyExtraction
    risk_framing: RiskFramingAnalysis


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
