from __future__ import annotations

import inspect
import json
import os
import random
import re
import shutil
import socket
import sys
import threading
import time
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha256
from pathlib import Path
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import Field, ValidationError

from observatory.db import PostgresAnalysisStore
from observatory.models import (
    AnalysisProvenance,
    DocumentAnalysis,
    EnforcementMechanism,
    EvidenceSpan,
    JurisdictionAnalysis,
    JurisdictionFrameStat,
    JurisdictionLabelStat,
    JurisdictionSourceReference,
    PolicyExtraction,
    RiskFramingAnalysis,
    SafetyRequirement,
    StrictBaseModel,
)
from observatory.parser import PARSED_DATA_DIR, ParsedDocument, ParsedSection
from observatory.persistence import (
    PIPELINE_ANALYSIS_VERSION,
    AnalysisStore,
    build_analysis_persistence_bundle,
    build_jurisdiction_analysis_persistence_bundle,
)
from observatory.prompts import build_shared_codebook_system_prefix, load_prompt
from observatory.schema_validation import SCHEMAS_DIR, validate_document_analysis_payload
from observatory.source_registry import ROOT, SeedDocument, load_all_source_manifests
from observatory.taxonomy import (
    get_canonical_thresholds,
    get_taxonomy_version,
    load_taxonomy,
)
from observatory.url_safety import repo_rel_posix


ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_MODEL = "claude-opus-5-5"
DEFAULT_ANTHROPIC_MODEL = DEFAULT_MODEL
DEFAULT_EFFORT = "low"
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_GEMINI_MODEL = "gemini-4-neon"
DEFAULT_GEMINI_THINKING_LEVEL = "medium"
VALID_GEMINI_THINKING_LEVELS = {"low", "medium", "high"}
DEFAULT_TEMPERATURE = 0.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_REQUEST_TIMEOUT_SECONDS = 600
RETRYABLE_HTTP_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504, 529}
GEMINI_RETRYABLE_HTTP_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
MAX_RETRY_AFTER_SECONDS = 60.0
ANALYSIS_DIR = ROOT / "data" / "analysis"
RAW_DATA_DIR = ROOT / "data" / "raw"
UNSUPPORTED_ANTHROPIC_SCHEMA_KEYS = {
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
}

# Token-aware budgets accounting for CJK (~1.2 chars/token) vs Latin (~3.8 chars/token).
DIRECT_FULL_TEXT_MAX_TOKENS = 90_000
CHUNK_MAX_TOKENS = 45_000
DIRECT_FULL_TEXT_MAX_CHARS = 350_000
CHUNK_MAX_CHARS = 180_000
# Gemini 4 Neon 1M-token context window: send entire mega-statutes (e.g., 582k-char EU AI Act) in one pass!
GEMINI_DIRECT_FULL_TEXT_MAX_TOKENS = 450_000
GEMINI_DIRECT_FULL_TEXT_MAX_CHARS = 1_500_000
GEMINI_CHUNK_MAX_TOKENS = 250_000
GEMINI_CHUNK_MAX_CHARS = 800_000
CHUNK_OVERLAP_SECTIONS = 1
POLICY_METADATA_MAX_CHARS = DIRECT_FULL_TEXT_MAX_CHARS
POLICY_CONTROLS_MAX_CHARS = DIRECT_FULL_TEXT_MAX_CHARS
RISK_FRAMING_MAX_CHARS = DIRECT_FULL_TEXT_MAX_CHARS

# Output token budgets (D3 + Stage 4A thinking-model headroom).
POLICY_METADATA_MAX_TOKENS = 4096
POLICY_CONTROLS_MAX_TOKENS = 8192
RISK_FRAMING_MAX_TOKENS = 4096
MAX_TOKENS_RETRY_CAP = 16384
GEMINI_METADATA_MAX_TOKENS = 16384
GEMINI_CONTROLS_MAX_TOKENS = 32768
GEMINI_FRAMING_MAX_TOKENS = 16384
GEMINI_MAX_TOKENS_RETRY_CAP = 65536
MAX_EVIDENCE_SPANS_PER_LABEL = 2
MAX_EVIDENCE_SPANS_FRAMING = 6
MAX_EVIDENCE_QUOTE_CHARS = 400
MAX_SNAP_QUOTE_CHARS = 450
MAX_ANALYSIS_WORKERS = 16
OBLIGATION_STRENGTH_RANK = {
    "mandatory": 4,
    "conditional": 3,
    "recommended": 2,
    "aspirational": 1,
}


class MaxTokensTruncatedError(RuntimeError):
    """Raised when an LLM API truncates a structured response at its output token limit."""


class LegacyProvenanceError(ValueError):
    """Raised when attempting to persist a legacy artifact lacking analysis_metadata without --allow-legacy."""

# Multilingual (EN + ZH + JA + KO) fallback section-scoring keywords for excerpt helpers.
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
    # Chinese
    "适用范围",
    "目的",
    "定义",
    "提供者",
    "使用者",
    "主管部门",
    "法律责任",
    "处罚",
    "罚款",
    "施行",
    "有效期",
    # Japanese
    "目的",
    "定義",
    "対象",
    "事業者",
    "開発者",
    "提供者",
    "利用者",
    "主務大臣",
    "罰則",
    "施行",
    # Korean
    "목적",
    "정의",
    "적용범위",
    "사업자",
    "개발사업자",
    "이용사업자",
    "과태료",
    "벌칙",
    "시행일",
    "과학기술정보통신부",
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
    "watermark",
    "agentic",
    "training data",
    "open-weight",
    "representative",
    # Chinese
    "风险评估",
    "安全评估",
    "备案",
    "标识",
    "监督检查",
    "审计",
    "监测",
    "报告",
    "透明",
    "训练数据",
    "禁止",
    "算法",
    "人工干预",
    "安全测试",
    # Japanese
    "リスク評価",
    "安全性評価",
    "透明性",
    "説明責任",
    "監査",
    "レッドチーム",
    "インシデント",
    "報告",
    "学習データ",
    "人間中心",
    "監督",
    "検証",
    # Korean
    "위험관리",
    "영향평가",
    "안전성",
    "투명성",
    "고지",
    "표시",
    "신고",
    "감독",
    "시정명령",
    "국내대리인",
    "고영향",
    "검증",
    "레드팀",
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
    "catastrophic",
    "workforce",
    "labor",
    # Chinese
    "国家安全",
    "社会稳定",
    "公共秩序",
    "社会主义核心价值观",
    "创新发展",
    "合法权益",
    "竞争力",
    "公共利益",
    "安全可控",
    # Japanese
    "イノベーション",
    "国際競争力",
    "人間中心",
    "基本的人権",
    "安全保障",
    "信頼",
    "経済成長",
    "社会課題",
    # Korean
    "국가경쟁력",
    "혁신",
    "신뢰",
    "기본권",
    "국민의 안전",
    "국가안보",
    "공공의 안녕",
    "산업 진흥",
)

LOW_FIDELITY_PARSER_WARNINGS = {
    "image_only_html_content",
    "empty_html_after_cleaning",
}
MIN_ANALYSIS_NON_WHITESPACE_CHARS = 160
MIN_SUBSTANTIVE_SECTION_CHARS = 40
JURISDICTION_ANALYSIS_VERSION = "0.2.0"
JURISDICTION_ANALYSIS_METHOD = "deterministic_v2"
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
    "agentic_autonomy_controls": "agentic autonomy controls",
    "training_data_governance": "training data governance",
    "frontier_safety_evaluation": "frontier safety evaluation",
    "open_weight_obligations": "open-weight obligations",
    "domestic_representative": "domestic representative",
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
NON_STATUTORY_TITLE_MARKERS = (
    "faq",
    "q&a",
    "questions and answers",
    "questions & answers",
    "答记者问",
    "질의응답",
    "overview",
    "press release",
    "draft notice",
    "입법예고",
    "행정예고",
    "public consultation",
    "征求意见",
    "vademecum",
    "template",
    "interpretation",
    "解读",
)

# Jurisdiction-scoped canonical institution alias rules: (pattern, canonical_name, allowed_jurisdictions).
# Ambiguous acronyms/terms like `\bmost\b` and `State Council` are strictly scoped to their jurisdiction (D9).
INSTITUTION_ALIAS_RULES: tuple[tuple[re.Pattern[str], str, frozenset[str] | None], ...] = (
    (re.compile(r"\bnist\b|national institute of standards and technology", re.IGNORECASE), "National Institute of Standards and Technology (NIST)", frozenset({"united_states"})),
    (re.compile(r"\bwhite house\b|\bexecutive office of the president\b|\bpresident of the united states\b", re.IGNORECASE), "The White House", frozenset({"united_states"})),
    (re.compile(r"\bomb\b|office of management and budget", re.IGNORECASE), "Office of Management and Budget (OMB)", frozenset({"united_states"})),
    (re.compile(r"\bostp\b|office of science and technology policy", re.IGNORECASE), "Office of Science and Technology Policy (OSTP)", frozenset({"united_states"})),
    (re.compile(r"\bftc\b|federal trade commission", re.IGNORECASE), "Federal Trade Commission (FTC)", frozenset({"united_states"})),
    (re.compile(r"\bfda\b|food and drug administration", re.IGNORECASE), "Food and Drug Administration (FDA)", frozenset({"united_states"})),
    (re.compile(r"\bcfpb\b|consumer financial protection bureau", re.IGNORECASE), "Consumer Financial Protection Bureau (CFPB)", frozenset({"united_states"})),
    (re.compile(r"\bntia\b|national telecommunications and information administration", re.IGNORECASE), "National Telecommunications and Information Administration (NTIA)", frozenset({"united_states"})),
    (re.compile(r"european commission|\bai office\b|european ai office", re.IGNORECASE), "European Commission (AI Office)", frozenset({"european_union"})),
    (re.compile(r"\bai board\b|european artificial intelligence board", re.IGNORECASE), "European Artificial Intelligence Board (AI Board)", frozenset({"european_union"})),
    (re.compile(r"european parliament|council of the european union", re.IGNORECASE), "European Parliament and Council", frozenset({"european_union"})),
    (re.compile(r"\bedpb\b|european data protection board", re.IGNORECASE), "European Data Protection Board (EDPB)", frozenset({"european_union"})),
    (re.compile(r"\bmsit\b|ministry of science and ict|과학기술정보통신부", re.IGNORECASE), "Ministry of Science and ICT (MSIT)", frozenset({"south_korea"})),
    (re.compile(r"\bpipc\b|개인정보\s*보호\s*위원회|personal information protection commission.*korea", re.IGNORECASE), "Personal Information Protection Commission (PIPC)", frozenset({"south_korea"})),
    (re.compile(r"personal information protection commission.*japan|個人情報保護委員会|\bppc\b", re.IGNORECASE), "Personal Information Protection Commission (PPC)", frozenset({"japan"})),
    (re.compile(r"\bmeti\b|ministry of economy,?\s*trade and industry|経済産業省", re.IGNORECASE), "Ministry of Economy, Trade and Industry (METI)", frozenset({"japan"})),
    (re.compile(r"\bmic\b|ministry of internal affairs and communications|総務省", re.IGNORECASE), "Ministry of Internal Affairs and Communications (MIC)", frozenset({"japan"})),
    (re.compile(r"cabinet office|内閣府|cabinet secretariat|内閣官房", re.IGNORECASE), "Cabinet Office / Secretariat of Japan", frozenset({"japan"})),
    (re.compile(r"digital agency|デジタル庁", re.IGNORECASE), "Digital Agency of Japan", frozenset({"japan"})),
    (re.compile(r"\bmhlw\b|ministry of health,?\s*labour and welfare|厚生労働省", re.IGNORECASE), "Ministry of Health, Labour and Welfare (MHLW)", frozenset({"japan"})),
    (re.compile(r"agency for cultural affairs|文化庁", re.IGNORECASE), "Agency for Cultural Affairs (Japan)", frozenset({"japan"})),
    (re.compile(r"\baisi\b|ai safety institute", re.IGNORECASE), "AI Safety Institute (AISI)", None),
    (re.compile(r"\bcac\b|cyberspace administration of china|国家互联网信息办公室|中央网信办", re.IGNORECASE), "Cyberspace Administration of China (CAC)", frozenset({"china"})),
    (re.compile(r"\bmost\b|ministry of science and technology|科学技术部|科技部", re.IGNORECASE), "Ministry of Science and Technology (MOST)", frozenset({"china"})),
    (re.compile(r"\btc260\b|全国网络安全标准化技术委员会|全国信息安全标准化技术委员会", re.IGNORECASE), "TC260 (National Cybersecurity Standardization Technical Committee)", frozenset({"china"})),
    (re.compile(r"state council|国务院", re.IGNORECASE), "State Council of China", frozenset({"china"})),
    (re.compile(r"\bmiit\b|ministry of industry and information technology|工业和信息化部", re.IGNORECASE), "Ministry of Industry and Information Technology (MIIT)", frozenset({"china"})),
    (re.compile(r"\bnmpa\b|national medical products administration|国家药监局|国家药品监督管理局", re.IGNORECASE), "National Medical Products Administration (NMPA)", frozenset({"china"})),
)

# Patterns that are too ambiguous in English to match without an explicit jurisdiction match.
JURISDICTION_REQUIRED_ALIAS_CANONICALS = frozenset(
    {
        "Ministry of Science and Technology (MOST)",
        "State Council of China",
    }
)

# Model token rates (USD per 1M tokens) for observability cost estimation.
MODEL_COST_PER_MILLION = {
    "input": 3.0,
    "output": 15.0,
    "cache_creation": 3.75,
    "cache_read": 0.30,
}

POLICY_METADATA_FOCUS_INSTRUCTIONS = (
    "Extract only the document-level policy metadata, scope, dates, authorities, deadlines, "
    "and implementation notes. Do not include safety requirement or enforcement mechanism arrays."
)
POLICY_CONTROLS_FOCUS_INSTRUCTIONS = (
    "Extract only the named safety requirements and enforcement mechanisms. "
    "Use conservative labels and provide verbatim original-language evidence spans for each item."
)
RISK_FRAMING_FOCUS_INSTRUCTIONS = (
    "Focus on the document's stated reasons for AI governance, especially rights, security, "
    "competition, innovation, public-order, and societal-risk language. Provide calibrated scores "
    "for all eight risk frames."
)


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
    seed_document: SeedDocument | None = None


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
    confidence: float = Field(ge=0.0, le=1.0)


class PolicyControlsExtraction(StrictBaseModel):
    safety_requirements: list[SafetyRequirement] = Field(default_factory=list)
    enforcement_mechanisms: list[EnforcementMechanism] = Field(default_factory=list)


def _retry_delay_seconds(attempt: int, retry_after_header: str | None = None) -> float:
    if retry_after_header:
        cleaned = retry_after_header.strip()
        try:
            seconds = float(cleaned)
            if seconds >= 0:
                return min(seconds, MAX_RETRY_AFTER_SECONDS)
        except ValueError:
            try:
                target_dt = parsedate_to_datetime(cleaned)
                if target_dt.tzinfo is None:
                    target_dt = target_dt.replace(tzinfo=timezone.utc)
                delta = (target_dt - datetime.now(timezone.utc)).total_seconds()
                if delta > 0:
                    return min(delta, MAX_RETRY_AFTER_SECONDS)
            except (TypeError, ValueError, OverflowError):
                pass
    return float(min(2 ** (attempt - 1), 8))


GEMINI_COST_PER_MILLION = {
    "input": 1.25,
    "output": 10.0,
    "cache_creation": 1.25,
    "cache_read": 0.3125,
}


def _estimate_usage_cost_usd(usage: dict[str, Any], *, provider: str | None = None) -> float:
    rates = GEMINI_COST_PER_MILLION if provider == "gemini" else MODEL_COST_PER_MILLION
    input_tokens = int(usage.get("input_tokens") or 0)
    output_tokens = int(usage.get("output_tokens") or 0) + int(usage.get("thoughts_tokens") or 0)
    cache_creation = int(usage.get("cache_creation_input_tokens") or 0)
    cache_read = int(usage.get("cache_read_input_tokens") or 0)
    # Gemini's promptTokenCount already includes cachedContentTokenCount; avoid double-billing cached tokens.
    billable_input_tokens = max(0, input_tokens - cache_read) if provider == "gemini" else input_tokens
    cost = (
        (billable_input_tokens / 1_000_000) * rates["input"]
        + (output_tokens / 1_000_000) * rates["output"]
        + (cache_creation / 1_000_000) * rates["cache_creation"]
        + (cache_read / 1_000_000) * rates["cache_read"]
    )
    return round(cost, 6)


def _accumulate_usage(
    responses: Sequence[dict[str, Any]],
    *,
    provider: str | None = None,
) -> dict[str, Any]:
    totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "thoughts_tokens": 0,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
    }
    detected_provider = provider
    for response in responses:
        if not isinstance(response, dict):
            continue
        if detected_provider is None and isinstance(response.get("provider"), str):
            detected_provider = response["provider"]
        usage = response.get("usage")
        if isinstance(usage, dict):
            for key in totals:
                totals[key] += int(usage.get(key) or 0)
            continue
        gemini_usage = response.get("usageMetadata")
        if isinstance(gemini_usage, dict):
            detected_provider = detected_provider or "gemini"
            totals["input_tokens"] += int(gemini_usage.get("promptTokenCount") or 0)
            totals["output_tokens"] += int(gemini_usage.get("candidatesTokenCount") or 0)
            totals["thoughts_tokens"] += int(gemini_usage.get("thoughtsTokenCount") or 0)
            totals["cache_read_input_tokens"] += int(gemini_usage.get("cachedContentTokenCount") or 0)
    summary: dict[str, Any] = {
        "input_tokens": totals["input_tokens"],
        "output_tokens": totals["output_tokens"],
        "cache_creation_input_tokens": totals["cache_creation_input_tokens"],
        "cache_read_input_tokens": totals["cache_read_input_tokens"],
    }
    if totals["thoughts_tokens"] > 0 or detected_provider == "gemini":
        summary["thoughts_tokens"] = totals["thoughts_tokens"]
    summary["estimated_cost_usd"] = _estimate_usage_cost_usd(totals, provider=detected_provider)
    return summary


class ClaudeAPIClient:
    provider = "anthropic"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        effort: str | None = None,
        temperature: float | None = DEFAULT_TEMPERATURE,
        anthropic_version: str = DEFAULT_ANTHROPIC_VERSION,
        max_retries: int = DEFAULT_MAX_RETRIES,
        timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
        enable_prompt_caching: bool = True,
    ) -> None:
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY is required")
        self.model = model or os.getenv("ANTHROPIC_MODEL", DEFAULT_MODEL)
        self.effort = effort or os.getenv("ANTHROPIC_EFFORT", DEFAULT_EFFORT)
        self.temperature = temperature
        self.anthropic_version = anthropic_version
        self.max_retries = max(max_retries, 1)
        self.timeout_seconds = max(int(timeout_seconds), 1)
        self.enable_prompt_caching = enable_prompt_caching

    def create_json_response(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        schema: dict[str, Any],
        max_tokens: int,
        system_prefix: str | None = None,
        cached_document_context: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        sanitized_schema = _sanitize_schema_for_anthropic(schema)
        if self.enable_prompt_caching:
            if system_prefix is not None and cached_document_context is not None:
                # D8: Keep `system` and `messages[0].content[0]` strictly byte-identical across
                # all 3 calls per chunk so Anthropic's sequential prefix cache hits BOTH breakpoints;
                # place the varying task-specific `system_prompt` AFTER the cached document block.
                system_field: Any = [
                    {
                        "type": "text",
                        "text": system_prefix,
                        "cache_control": {"type": "ephemeral"},
                    }
                ]
                user_content: Any = [
                    {
                        "type": "text",
                        "text": cached_document_context,
                        "cache_control": {"type": "ephemeral"},
                    },
                    {"type": "text", "text": f"{system_prompt}\n\n{user_prompt}"},
                ]
            elif system_prefix is not None:
                system_field = [
                    {
                        "type": "text",
                        "text": system_prefix,
                        "cache_control": {"type": "ephemeral"},
                    },
                    {
                        "type": "text",
                        "text": system_prompt,
                    },
                ]
                user_content = user_prompt
            else:
                system_field = [
                    {
                        "type": "text",
                        "text": system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ]
                if cached_document_context is not None:
                    user_content = [
                        {
                            "type": "text",
                            "text": cached_document_context,
                            "cache_control": {"type": "ephemeral"},
                        },
                        {"type": "text", "text": user_prompt},
                    ]
                else:
                    user_content = user_prompt
        else:
            system_field = f"{system_prefix}\n\n{system_prompt}" if system_prefix else system_prompt
            user_content = f"{cached_document_context}\n\n{user_prompt}" if cached_document_context else user_prompt

        payload: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system_field,
            "messages": [{"role": "user", "content": user_content}],
            "output_config": {
                "effort": self.effort,
                "format": {
                    "type": "json_schema",
                    "schema": sanitized_schema,
                },
            },
        }
        if self.temperature is not None:
            payload["temperature"] = self.temperature

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
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    response_payload = json.load(response)
                break
            except HTTPError as exc:
                message = exc.read().decode("utf-8", errors="ignore")
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                if exc.code in RETRYABLE_HTTP_STATUS_CODES and attempt < self.max_retries:
                    time.sleep(_retry_delay_seconds(attempt, retry_after))
                    continue
                raise RuntimeError(f"Anthropic API HTTP {exc.code}: {message}") from exc
            except (TimeoutError, socket.timeout) as exc:
                if attempt < self.max_retries:
                    time.sleep(_retry_delay_seconds(attempt))
                    continue
                raise RuntimeError(f"Anthropic API request timed out after {self.timeout_seconds}s") from exc
            except URLError as exc:
                if attempt < self.max_retries:
                    time.sleep(_retry_delay_seconds(attempt))
                    continue
                raise RuntimeError(f"Anthropic API network error: {exc.reason}") from exc

        if response_payload is None:
            raise RuntimeError("Anthropic API request failed without a response payload")

        if response_payload.get("stop_reason") == "max_tokens":
            raise MaxTokensTruncatedError(
                f"Anthropic API response truncated at max_tokens={max_tokens}"
            )

        text_blocks = [
            block.get("text", "")
            for block in response_payload.get("content", [])
            if block.get("type") == "text"
        ]
        if not text_blocks:
            raise RuntimeError("Anthropic API returned no text content")

        json_payload = json.loads("".join(text_blocks))
        return json_payload, response_payload


def _strip_json_code_fences(raw_text: str) -> str:
    stripped = raw_text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, count=1)
        stripped = re.sub(r"\s*```\s*$", "", stripped, count=1)
    return stripped.strip()


class GeminiAPIClient:
    """Native stdlib Gemini REST client supporting Gemini 4 Neon thinking models & 1M-token context."""

    provider = "gemini"
    direct_full_text_max_tokens = GEMINI_DIRECT_FULL_TEXT_MAX_TOKENS
    direct_full_text_max_chars = GEMINI_DIRECT_FULL_TEXT_MAX_CHARS
    chunk_max_tokens = GEMINI_CHUNK_MAX_TOKENS
    chunk_max_chars = GEMINI_CHUNK_MAX_CHARS
    metadata_max_tokens = GEMINI_METADATA_MAX_TOKENS
    controls_max_tokens = GEMINI_CONTROLS_MAX_TOKENS
    framing_max_tokens = GEMINI_FRAMING_MAX_TOKENS
    max_tokens_retry_cap = GEMINI_MAX_TOKENS_RETRY_CAP

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        effort: str | None = None,
        temperature: float | None = DEFAULT_TEMPERATURE,
        max_retries: int = DEFAULT_MAX_RETRIES,
        timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
    ) -> None:
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is required")
        self.model = model or os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
        raw_effort = (effort or os.getenv("GEMINI_THINKING_LEVEL") or DEFAULT_GEMINI_THINKING_LEVEL).strip().lower()
        if raw_effort not in VALID_GEMINI_THINKING_LEVELS:
            raise ValueError(
                f"invalid Gemini thinking level '{raw_effort}' (expected one of {sorted(VALID_GEMINI_THINKING_LEVELS)})"
            )
        self.effort = raw_effort
        self.temperature = temperature
        self.max_retries = max(max_retries, 1)
        self.timeout_seconds = max(int(timeout_seconds), 1)

    def create_json_response(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        schema: dict[str, Any],
        max_tokens: int,
        system_prefix: str | None = None,
        cached_document_context: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        full_system = f"{system_prefix}\n\n{system_prompt}" if system_prefix else system_prompt
        full_user = f"{cached_document_context}\n\n{user_prompt}" if cached_document_context else user_prompt

        generation_config: dict[str, Any] = {
            "responseMimeType": "application/json",
            "maxOutputTokens": max_tokens,
            "thinkingConfig": {"thinkingLevel": self.effort},
        }
        if self.temperature is not None:
            generation_config["temperature"] = self.temperature

        payload: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": full_system}]},
            "contents": [{"role": "user", "parts": [{"text": full_user}]}],
            "generationConfig": generation_config,
        }

        endpoint = f"{GEMINI_API_BASE_URL}/{self.model}:generateContent"
        request = Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "x-goog-api-key": self.api_key,
            },
            method="POST",
        )
        response_payload: dict[str, Any] | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    response_payload = json.load(response)
                break
            except HTTPError as exc:
                message = exc.read().decode("utf-8", errors="ignore").replace(self.api_key, "[REDACTED]")
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                if exc.code in GEMINI_RETRYABLE_HTTP_STATUS_CODES and attempt < self.max_retries:
                    time.sleep(_retry_delay_seconds(attempt, retry_after))
                    continue
                raise RuntimeError(f"Gemini API HTTP {exc.code}: {message}") from exc
            except (TimeoutError, socket.timeout) as exc:
                if attempt < self.max_retries:
                    time.sleep(_retry_delay_seconds(attempt))
                    continue
                raise RuntimeError(f"Gemini API request timed out after {self.timeout_seconds}s") from exc
            except URLError as exc:
                reason = str(exc.reason).replace(self.api_key, "[REDACTED]")
                if attempt < self.max_retries:
                    time.sleep(_retry_delay_seconds(attempt))
                    continue
                raise RuntimeError(f"Gemini API network error: {reason}") from exc

        if response_payload is None:
            raise RuntimeError("Gemini API request failed without a response payload")

        candidates = response_payload.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            feedback = response_payload.get("promptFeedback")
            raise RuntimeError(f"Gemini API returned no candidates (promptFeedback={feedback!r})")

        candidate = candidates[0]
        finish_reason = candidate.get("finishReason")
        if finish_reason == "MAX_TOKENS":
            raise MaxTokensTruncatedError(
                f"Gemini API response truncated at maxOutputTokens={max_tokens}"
            )

        content = candidate.get("content") or {}
        parts = content.get("parts") or []
        text_parts = [
            part.get("text", "")
            for part in parts
            if isinstance(part, dict) and not part.get("thought") and isinstance(part.get("text"), str)
        ]
        if not text_parts:
            raise RuntimeError(f"Gemini API returned no non-thought text content (finishReason={finish_reason!r})")

        raw_text = _strip_json_code_fences("".join(text_parts))
        json_payload = json.loads(raw_text)

        # Normalize metadata onto raw response (never storing API keys) for clean usage & replay auditing.
        sanitized_raw = {
            "provider": self.provider,
            "model": self.model,
            "effort": self.effort,
            "finishReason": finish_reason,
            "usageMetadata": response_payload.get("usageMetadata") or {},
            "modelVersion": response_payload.get("modelVersion"),
            "responseId": response_payload.get("responseId"),
        }
        return json_payload, sanitized_raw


def create_llm_client(
    *,
    provider: str | None = None,
    model: str | None = None,
    effort: str | None = None,
) -> StructuredOutputClient:
    """Resolve and instantiate the configured LLM provider client (auto|gemini|anthropic)."""
    resolved = (provider or os.getenv("LLM_PROVIDER") or "auto").strip().lower()
    if resolved == "auto":
        if os.getenv("GEMINI_API_KEY"):
            resolved = "gemini"
        elif os.getenv("ANTHROPIC_API_KEY"):
            resolved = "anthropic"
        else:
            raise ValueError(
                "No LLM API key configured: set GEMINI_API_KEY (default gemini-4-neon) "
                "or ANTHROPIC_API_KEY (claude-opus-5-5), or pass --provider=gemini|anthropic"
            )
    if resolved == "gemini":
        return GeminiAPIClient(model=model, effort=effort)
    if resolved == "anthropic":
        return ClaudeAPIClient(model=model, effort=effort)
    raise ValueError(f"unsupported LLM provider '{resolved}' (expected auto, gemini, or anthropic)")


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
    if record.seed_document and record.seed_document.languages:
        return record.seed_document.languages[0]
    return "unknown"


def _source_url(record: ParsedDocumentRecord) -> str:
    candidate = record.raw_metadata.get("source_url") or record.raw_metadata.get("canonical_url")
    if isinstance(candidate, str) and candidate:
        return candidate
    if record.seed_document is not None:
        return str(record.seed_document.canonical_url)
    return "unknown"


def _load_parsed_document_records(
    jurisdiction: str | None = None,
    document_id: str | None = None,
) -> list[ParsedDocumentRecord]:
    allowed_documents_by_jurisdiction: dict[str, dict[str, SeedDocument]] = {}
    for manifest in load_all_source_manifests():
        if jurisdiction is not None and manifest.jurisdiction != jurisdiction:
            continue
        allowed_documents_by_jurisdiction[manifest.jurisdiction] = {
            document.id: document for document in manifest.seed_documents
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
        seed_map = allowed_documents_by_jurisdiction.get(doc_jurisdiction, {})
        if doc_id not in seed_map:
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
                seed_document=seed_map[doc_id],
            )
        )

    return records


def _strip_pipeline_only_span_fields(
    schema: dict[str, Any],
    *,
    include_frame_enum: list[str] | None = None,
) -> None:
    defs = schema.get("$defs")
    if not isinstance(defs, dict):
        return
    span_def = defs.get("EvidenceSpan")
    if not isinstance(span_def, dict):
        return
    props = span_def.get("properties")
    if not isinstance(props, dict):
        return
    for pipeline_field in ("grounding_status", "start_char", "end_char"):
        props.pop(pipeline_field, None)
    if include_frame_enum is not None:
        props["frame"] = {
            "anyOf": [
                {"enum": include_frame_enum, "type": "string"},
                {"type": "null"},
            ]
        }
    else:
        props.pop("frame", None)


def _inject_obligation_strength_enum(schema: dict[str, Any], allowed_values: list[str]) -> None:
    defs = schema.get("$defs")
    if not isinstance(defs, dict):
        return
    req_def = defs.get("SafetyRequirement")
    if not isinstance(req_def, dict):
        return
    props = req_def.get("properties")
    if isinstance(props, dict) and "obligation_strength" in props:
        props["obligation_strength"] = {
            "anyOf": [
                {"enum": allowed_values, "type": "string"},
                {"type": "null"},
            ]
        }


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
    if "obligation_strengths" in taxonomy:
        _inject_obligation_strength_enum(schema, taxonomy["obligation_strengths"])
    _strip_pipeline_only_span_fields(schema, include_frame_enum=None)
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
    if "obligation_strengths" in taxonomy:
        _inject_obligation_strength_enum(schema, taxonomy["obligation_strengths"])
    _strip_pipeline_only_span_fields(schema, include_frame_enum=None)
    return schema


def _risk_framing_schema() -> dict[str, Any]:
    taxonomy = load_taxonomy()
    schema = RiskFramingAnalysis.model_json_schema()
    properties = schema["properties"]
    properties["dominant_frame"]["enum"] = taxonomy["risk_framings"]
    properties["secondary_frames"]["items"]["enum"] = taxonomy["risk_framings"]
    closed_frame_map = {
        "type": "object",
        "properties": {
            frame: {
                "type": "number",
            }
            for frame in taxonomy["risk_framings"]
        },
        "required": list(taxonomy["risk_framings"]),
        "additionalProperties": False,
    }
    properties["frame_confidence"] = closed_frame_map
    properties["frame_share"] = deepcopy(closed_frame_map)
    if "frame_share" not in schema.get("required", []):
        schema.setdefault("required", []).append("frame_share")
    _strip_pipeline_only_span_fields(schema, include_frame_enum=taxonomy["risk_framings"])
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


def normalize_frame_confidence(
    frame_confidence: dict[str, float],
    *,
    valid_frames: Sequence[str] | None = None,
    dominant_frame: str | None = None,
) -> dict[str, float]:
    """Return an L1-normalized distribution over all canonical frames summing to 1.0."""
    frames = list(valid_frames) if valid_frames is not None else load_taxonomy()["risk_framings"]
    cleaned: dict[str, float] = {}
    for frame in frames:
        raw = frame_confidence.get(frame, 0.0)
        score = float(raw) if isinstance(raw, (int, float)) and raw == raw else 0.0
        cleaned[frame] = min(max(score, 0.0), 1.0)

    total = sum(cleaned.values())
    if total <= 0.0:
        if dominant_frame and dominant_frame in cleaned:
            cleaned[dominant_frame] = 1.0
            return cleaned
        return cleaned

    return {frame: score / total for frame, score in cleaned.items()}


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

    seen_domains: set[str] = set()
    for domain in extraction.covered_application_domains:
        if domain not in taxonomy["application_domains"]:
            raise ValueError(f"unknown application domain label '{domain}'")
        if domain in seen_domains:
            raise ValueError(f"duplicate application domain label '{domain}'")
        seen_domains.add(domain)

    valid_obligation_strengths = set(taxonomy.get("obligation_strengths", []))
    seen_requirements: set[str] = set()
    for requirement in extraction.safety_requirements:
        if requirement.label not in taxonomy["policy_requirements"]:
            raise ValueError(f"unknown safety requirement label '{requirement.label}'")
        if requirement.label in seen_requirements:
            raise ValueError(f"duplicate safety requirement label '{requirement.label}'")
        if (
            requirement.obligation_strength is not None
            and valid_obligation_strengths
            and requirement.obligation_strength not in valid_obligation_strengths
        ):
            raise ValueError(
                f"unknown obligation_strength '{requirement.obligation_strength}' "
                f"for requirement '{requirement.label}'"
            )
        if not requirement.evidence or not any(span.quote.strip() for span in requirement.evidence):
            raise ValueError(f"safety requirement '{requirement.label}' must include at least one evidence span")
        seen_requirements.add(requirement.label)

    seen_mechanisms: set[str] = set()
    for mechanism in extraction.enforcement_mechanisms:
        if mechanism.label not in taxonomy["enforcement_mechanisms"]:
            raise ValueError(f"unknown enforcement mechanism label '{mechanism.label}'")
        if mechanism.label in seen_mechanisms:
            raise ValueError(f"duplicate enforcement mechanism label '{mechanism.label}'")
        if not mechanism.evidence or not any(span.quote.strip() for span in mechanism.evidence):
            raise ValueError(f"enforcement mechanism '{mechanism.label}' must include at least one evidence span")
        seen_mechanisms.add(mechanism.label)

    valid_frames = set(taxonomy["risk_framings"])
    if framing.dominant_frame not in valid_frames:
        raise ValueError(f"unknown dominant frame label '{framing.dominant_frame}'")

    seen_secondary: set[str] = set()
    for frame in framing.secondary_frames:
        if frame not in valid_frames:
            raise ValueError(f"unknown secondary frame label '{frame}'")
        if frame == framing.dominant_frame:
            raise ValueError(f"dominant frame '{frame}' must not also appear in secondary_frames")
        if frame in seen_secondary:
            raise ValueError(f"duplicate secondary frame label '{frame}'")
        seen_secondary.add(frame)

    for frame, score in framing.frame_confidence.items():
        if frame not in valid_frames:
            raise ValueError(f"unknown frame confidence label '{frame}'")
        if score < 0.0 or score > 1.0:
            raise ValueError(f"frame confidence score for '{frame}' out of bounds: {score}")

    if framing.frame_share is not None:
        for frame, share in framing.frame_share.items():
            if frame not in valid_frames:
                raise ValueError(f"unknown frame_share label '{frame}'")
            if share < 0.0 or share > 1.0:
                raise ValueError(f"frame_share value for '{frame}' out of bounds: {share}")

    for span in framing.evidence_spans:
        if span.frame is not None and span.frame not in valid_frames:
            raise ValueError(f"unknown evidence span frame label '{span.frame}'")

    if framing.frame_confidence:
        if framing.dominant_frame not in framing.frame_confidence:
            raise ValueError(
                f"dominant frame '{framing.dominant_frame}' is missing from frame_confidence"
            )
        dominant_score = framing.frame_confidence[framing.dominant_frame]
        highest_frame, highest_score = max(
            framing.frame_confidence.items(),
            key=lambda item: item[1],
        )
        if highest_score > dominant_score + 1e-9:
            raise ValueError(
                f"dominant frame '{framing.dominant_frame}' ({dominant_score}) "
                f"is scored below '{highest_frame}' ({highest_score})"
            )


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


def _build_analysis_prompts() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], str, str, str, str]:
    """Single source of truth for schemas, shared cacheable codebook prefix, and task prompts (D2 + D8)."""
    metadata_schema = _policy_metadata_schema()
    controls_schema = _policy_controls_schema()
    framing_schema = _risk_framing_schema()
    shared_system_prefix = build_shared_codebook_system_prefix()
    metadata_system_prompt = _build_task_system_prompt(
        "structured_extraction.md",
        metadata_schema,
        focus_instructions=POLICY_METADATA_FOCUS_INSTRUCTIONS,
    )
    controls_system_prompt = _build_task_system_prompt(
        "structured_extraction.md",
        controls_schema,
        focus_instructions=POLICY_CONTROLS_FOCUS_INSTRUCTIONS,
    )
    framing_system_prompt = _build_task_system_prompt(
        "risk_framing_analysis.md",
        framing_schema,
        focus_instructions=RISK_FRAMING_FOCUS_INSTRUCTIONS,
    )
    return (
        metadata_schema,
        controls_schema,
        framing_schema,
        shared_system_prefix,
        metadata_system_prompt,
        controls_system_prompt,
        framing_system_prompt,
    )


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


def _build_document_context_block(
    record: ParsedDocumentRecord,
    *,
    excerpt: str,
    chunk_note: str | None = None,
) -> str:
    header = (
        f"Document ID: {record.document_id}\n"
        f"Jurisdiction: {record.jurisdiction}\n"
        f"Title: {record.raw_metadata.get('title', record.parsed_document.title)}\n"
        f"Language: {_primary_language(record)}\n"
        f"Source URL: {_source_url(record)}\n"
    )
    if chunk_note:
        header += f"Chunk: {chunk_note}\n"
    return f"{header}\nDocument text:\n{excerpt}"


def _build_user_prompt(
    record: ParsedDocumentRecord,
    *,
    excerpt: str,
    task_label: str,
    chunk_note: str | None = None,
) -> str:
    context_block = _build_document_context_block(record, excerpt=excerpt, chunk_note=chunk_note)
    return f"{context_block}\n\nTask: {task_label}"


def _build_task_trigger_prompt(task_label: str, *, chunk_note: str | None = None) -> str:
    if chunk_note:
        return (
            f"Execute task `{task_label}` strictly on chunk {chunk_note} of the document provided above. "
            "Do not extrapolate from unprovided chunks."
        )
    return f"Execute task `{task_label}` on the document provided above."


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
    return sum(lowered.count(keyword.lower()) for keyword in keywords)


def _format_section_block(section: ParsedSection) -> str:
    content = _normalize_excerpt_text(section.content)
    if not content:
        return ""
    heading = _normalize_excerpt_text(section.heading)
    if heading:
        return f"Section: {heading}\n{content}"
    return content


def _full_formatted_document_text(record: ParsedDocumentRecord) -> str:
    blocks = [_format_section_block(section) for section in record.parsed_document.sections]
    non_empty = [block for block in blocks if block]
    if non_empty:
        return "\n\n".join(non_empty)
    return record.parsed_document.plain_text.strip()


def _is_cjk_script_char(ch: str) -> bool:
    code = ord(ch)
    return (
        0x3040 <= code <= 0x30FF  # Hiragana / Katakana
        or 0x3400 <= code <= 0x4DBF  # CJK Extension A
        or 0x4E00 <= code <= 0x9FFF  # CJK Unified Ideographs
        or 0xAC00 <= code <= 0xD7AF  # Hangul Syllables
        or 0xF900 <= code <= 0xFAFF  # CJK Compatibility Ideographs
    )


def _estimate_tokens(text: str) -> int:
    """Estimate LLM tokens accounting for CJK (~1.2 chars/token) vs Latin (~3.8 chars/token) (D5)."""
    if not text:
        return 0
    cjk_chars = sum(1 for ch in text if _is_cjk_script_char(ch))
    other_chars = len(text) - cjk_chars
    estimated = (cjk_chars / 1.2) + (other_chars / 3.8)
    return max(1, int(estimated + 0.999))


def _split_oversized_block(
    block: str,
    *,
    chunk_max_chars: int,
    chunk_max_tokens: int,
) -> list[str]:
    if len(block) <= chunk_max_chars and _estimate_tokens(block) <= chunk_max_tokens:
        return [block]

    # Compute effective char ceiling respecting the tighter of char budget and token budget.
    est_tokens = max(_estimate_tokens(block), 1)
    chars_per_token = len(block) / est_tokens
    token_char_ceiling = max(int(chunk_max_tokens * chars_per_token * 0.95), 400)
    effective_max_chars = min(chunk_max_chars, token_char_ceiling)
    overlap_chars = min(2000, effective_max_chars // 5)
    step = max(effective_max_chars - overlap_chars, 200)

    pieces: list[str] = []
    start = 0
    length = len(block)
    while start < length:
        end = min(start + effective_max_chars, length)
        # Try to snap cleanly to a paragraph/sentence boundary near end
        if end < length:
            snap_newline = block.rfind("\n", start + step // 2, end)
            if snap_newline > start:
                end = snap_newline
        piece = block[start:end].strip()
        if piece:
            pieces.append(piece)
        if end >= length:
            break
        next_start = max(start + 1, end - overlap_chars)
        start = next_start
    return pieces


def _chunk_document_for_analysis(
    record: ParsedDocumentRecord,
    *,
    direct_max_chars: int = DIRECT_FULL_TEXT_MAX_CHARS,
    chunk_max_chars: int = CHUNK_MAX_CHARS,
    direct_max_tokens: int = DIRECT_FULL_TEXT_MAX_TOKENS,
    chunk_max_tokens: int = CHUNK_MAX_TOKENS,
    overlap_sections: int = CHUNK_OVERLAP_SECTIONS,
) -> list[str]:
    """Return full text as 1 chunk when within char & token budgets, else deduped section chunks (D4+D5)."""
    full_text = _full_formatted_document_text(record)
    if len(full_text) <= direct_max_chars and _estimate_tokens(full_text) <= direct_max_tokens:
        return [full_text]

    section_blocks = [
        _format_section_block(section)
        for section in record.parsed_document.sections
    ]
    section_blocks = [block for block in section_blocks if block]
    if not section_blocks:
        section_blocks = [full_text]

    atomic_blocks: list[str] = []
    for block in section_blocks:
        atomic_blocks.extend(
            _split_oversized_block(
                block,
                chunk_max_chars=chunk_max_chars,
                chunk_max_tokens=chunk_max_tokens,
            )
        )

    chunks: list[str] = []
    index = 0
    total_blocks = len(atomic_blocks)
    prev_end_index = -1

    while index < total_blocks:
        current: list[str] = []
        current_chars = 0
        current_tokens = 0
        start_index = index
        while index < total_blocks:
            block = atomic_blocks[index]
            added_chars = len(block) + (2 if current else 0)
            added_tokens = _estimate_tokens(block)
            if current and (
                current_chars + added_chars > chunk_max_chars
                or current_tokens + added_tokens > chunk_max_tokens
            ):
                break
            current.append(block)
            current_chars += added_chars
            current_tokens += added_tokens
            index += 1

        end_index = index
        # D4 #1: Never emit a chunk whose block range is a subset of the previous chunk.
        if end_index <= prev_end_index:
            break
        chunks.append("\n\n".join(current))
        prev_end_index = end_index

        if index >= total_blocks:
            break
        if overlap_sections > 0:
            next_start = max(start_index + 1, index - overlap_sections)
            # Only backtrack when the remaining tail still introduces new blocks beyond prev_end_index.
            index = next_start

    return chunks


def _build_analysis_excerpt(
    record: ParsedDocumentRecord,
    *,
    keywords: tuple[str, ...],
    max_chars: int,
) -> str:
    """Build full text when it fits within max_chars, else prioritize highest-scoring sections."""
    full_text = _full_formatted_document_text(record)
    if len(full_text) <= max_chars:
        return full_text

    sections = record.parsed_document.sections
    if not sections:
        return _truncate_excerpt(record.parsed_document.plain_text, max_chars)

    scored_sections: list[tuple[int, int, str]] = []
    for index, section in enumerate(sections):
        block = _format_section_block(section)
        if not block:
            continue
        score = _section_score(block, keywords)
        if index < 2:
            score += 1
        scored_sections.append((score, index, block))

    if not scored_sections:
        return _truncate_excerpt(record.parsed_document.plain_text, max_chars)

    prioritized = sorted(scored_sections, key=lambda item: (-item[0], item[1]))
    selected_indexes: set[int] = set()
    budget = 0
    for _, index, block in prioritized:
        if selected_indexes and budget + len(block) + 2 > max_chars:
            continue
        selected_indexes.add(index)
        budget += len(block) + 2
        if budget >= max_chars:
            break

    ordered_blocks = [
        block
        for _, index, block in sorted(scored_sections, key=lambda item: item[1])
        if index in selected_indexes
    ]
    excerpt = "\n\n".join(ordered_blocks)
    if len(excerpt) < max_chars // 2:
        excerpt = record.parsed_document.plain_text
    return _truncate_excerpt(excerpt, max_chars)


def _metadata_chunk_informativeness(chunk: PolicyMetadataExtraction, *, is_primary: bool) -> float:
    score = 2.0 if is_primary else 0.0
    if chunk.publication_date:
        score += 1.0
    if chunk.effective_date:
        score += 1.0
    if chunk.penalties_summary and chunk.penalties_summary.strip():
        score += 1.0
    if chunk.covered_actors:
        score += 1.0
    if chunk.enforcement_authorities:
        score += 1.0
    if chunk.compliance_deadlines:
        score += 1.0
    if chunk.prohibited_practices:
        score += 1.0
    if chunk.covered_application_domains:
        score += 0.5
    return score


def _merge_policy_metadata_chunks(
    chunks: Sequence[PolicyMetadataExtraction],
) -> PolicyMetadataExtraction:
    if len(chunks) == 1:
        return chunks[0]

    primary = chunks[0]
    covered_actors = _unique_preserving_order(
        [actor for chunk in chunks for actor in chunk.covered_actors]
    )
    covered_domains = _unique_preserving_order(
        [domain for chunk in chunks for domain in chunk.covered_application_domains]
    )
    prohibited_practices = _unique_preserving_order(
        [practice for chunk in chunks for practice in chunk.prohibited_practices]
    )
    enforcement_authorities = _unique_preserving_order(
        [authority for chunk in chunks for authority in chunk.enforcement_authorities]
    )
    compliance_deadlines = _unique_preserving_order(
        [deadline for chunk in chunks for deadline in chunk.compliance_deadlines]
    )
    publication_date = next((chunk.publication_date for chunk in chunks if chunk.publication_date), None)
    effective_date = next((chunk.effective_date for chunk in chunks if chunk.effective_date), None)
    penalties = _unique_preserving_order(
        [chunk.penalties_summary.strip() for chunk in chunks if chunk.penalties_summary and chunk.penalties_summary.strip()]
    )
    notes = _unique_preserving_order(
        [chunk.implementation_notes.strip() for chunk in chunks if chunk.implementation_notes and chunk.implementation_notes.strip()]
    )

    # D4 #4: Do not dilute metadata confidence over uninformed later chunks.
    weights = [
        _metadata_chunk_informativeness(chunk, is_primary=(idx == 0))
        for idx, chunk in enumerate(chunks)
    ]
    informative_pairs = [(chunk.confidence, weight) for chunk, weight in zip(chunks, weights) if weight > 0.0]
    total_weight = sum(weight for _, weight in informative_pairs) or 1.0
    weighted_confidence = round(
        sum(conf * weight for conf, weight in informative_pairs) / total_weight,
        3,
    )
    return PolicyMetadataExtraction(
        issuing_body=primary.issuing_body,
        document_type=primary.document_type,
        binding_strength=primary.binding_strength,
        publication_date=publication_date,
        effective_date=effective_date,
        covered_actors=covered_actors,
        covered_application_domains=covered_domains,
        prohibited_practices=prohibited_practices,
        enforcement_authorities=enforcement_authorities,
        compliance_deadlines=compliance_deadlines,
        penalties_summary=" ".join(penalties[:3]) if penalties else None,
        implementation_notes=" ".join(notes[:3]) if notes else None,
        confidence=weighted_confidence,
    )


def _merge_evidence_spans(
    spans: Sequence[EvidenceSpan],
    *,
    limit: int = MAX_EVIDENCE_SPANS_PER_LABEL,
) -> list[EvidenceSpan]:
    seen_quotes: set[str] = set()
    merged: list[EvidenceSpan] = []
    for span in spans:
        key = " ".join(span.quote.split()).lower()
        if not key or key in seen_quotes:
            continue
        seen_quotes.add(key)
        merged.append(span)
        if len(merged) >= limit:
            break
    return merged


def _stronger_obligation_strength(a: str | None, b: str | None) -> str | None:
    if a is None:
        return b
    if b is None:
        return a
    return a if OBLIGATION_STRENGTH_RANK.get(a, 0) >= OBLIGATION_STRENGTH_RANK.get(b, 0) else b


def _merge_policy_controls_chunks(
    chunks: Sequence[PolicyControlsExtraction],
    *,
    plain_text: str | None = None,
) -> PolicyControlsExtraction:
    if len(chunks) == 1:
        return chunks[0]

    prepared = _build_normalized_index(plain_text) if plain_text is not None else None

    def _prioritize_and_filter_spans(
        spans: Sequence[EvidenceSpan],
        *,
        require_grounded: bool,
    ) -> list[EvidenceSpan]:
        if prepared is None:
            return _merge_evidence_spans(spans, limit=MAX_EVIDENCE_SPANS_PER_LABEL)
        ranked: list[tuple[int, EvidenceSpan]] = []
        for span in spans:
            status, start_char, end_char = _match_span_in_text(
                span.quote,
                plain_text or "",
                prepared_index=prepared,
            )
            annotated = span.model_copy(
                update={
                    "grounding_status": status,
                    "start_char": start_char,
                    "end_char": end_char,
                }
            )
            priority = 0 if status == "verbatim" else 1 if status == "approximate" else 2
            ranked.append((priority, annotated))
        if require_grounded:
            grounded_only = [span for priority, span in sorted(ranked, key=lambda item: item[0]) if priority < 2]
            return _merge_evidence_spans(grounded_only, limit=MAX_EVIDENCE_SPANS_PER_LABEL)
        ordered = [span for _, span in sorted(ranked, key=lambda item: item[0])]
        return _merge_evidence_spans(ordered, limit=MAX_EVIDENCE_SPANS_PER_LABEL)

    req_by_label: dict[str, tuple[float, str | None, list[EvidenceSpan]]] = {}
    for chunk in chunks:
        for req in chunk.safety_requirements:
            existing = req_by_label.get(req.label)
            if existing is None:
                req_by_label[req.label] = (req.confidence, req.obligation_strength, list(req.evidence))
            else:
                req_by_label[req.label] = (
                    max(existing[0], req.confidence),
                    _stronger_obligation_strength(existing[1], req.obligation_strength),
                    [*existing[2], *req.evidence],
                )

    enf_by_label: dict[str, tuple[float, list[EvidenceSpan]]] = {}
    for chunk in chunks:
        for mech in chunk.enforcement_mechanisms:
            existing = enf_by_label.get(mech.label)
            if existing is None:
                enf_by_label[mech.label] = (mech.confidence, list(mech.evidence))
            else:
                enf_by_label[mech.label] = (
                    max(existing[0], mech.confidence),
                    [*existing[1], *mech.evidence],
                )

    # Drop `none_specified` when concrete enforcement mechanisms were extracted in other chunks.
    if len(enf_by_label) > 1 and "none_specified" in enf_by_label:
        enf_by_label.pop("none_specified", None)

    # D4 #5: In multi-chunk merges with source text, require >= 1 grounded span per label to curb length-driven false positives.
    merged_reqs: list[SafetyRequirement] = []
    for label, (conf, ob_strength, evidence) in sorted(req_by_label.items(), key=lambda item: (-item[1][0], item[0])):
        chosen_spans = _prioritize_and_filter_spans(evidence, require_grounded=(prepared is not None))
        if not chosen_spans:
            continue
        merged_reqs.append(
            SafetyRequirement(
                label=label,
                confidence=round(conf, 3),
                obligation_strength=ob_strength,
                evidence=chosen_spans,
            )
        )

    merged_enfs: list[EnforcementMechanism] = []
    for label, (conf, evidence) in sorted(enf_by_label.items(), key=lambda item: (-item[1][0], item[0])):
        require_grounded = prepared is not None and label != "none_specified"
        chosen_spans = _prioritize_and_filter_spans(evidence, require_grounded=require_grounded)
        if not chosen_spans:
            continue
        merged_enfs.append(
            EnforcementMechanism(
                label=label,
                confidence=round(conf, 3),
                evidence=chosen_spans,
            )
        )

    return PolicyControlsExtraction(
        safety_requirements=merged_reqs,
        enforcement_mechanisms=merged_enfs,
    )


def _is_no_framing_chunk(chunk: RiskFramingAnalysis) -> bool:
    max_conf = max(chunk.frame_confidence.values(), default=0.0)
    if max_conf <= 0.05 and not chunk.evidence_spans:
        return True
    lowered = chunk.rationale_summary.strip().lower()
    if max_conf <= 0.05 and "no explicit framing language" in lowered:
        return True
    return False


def _chunk_framing_evidence_weight(chunk: RiskFramingAnalysis) -> float:
    if _is_no_framing_chunk(chunk):
        return 0.0
    max_conf = max(chunk.frame_confidence.values(), default=0.0)
    if max_conf <= 0.0:
        return 0.0
    evidence_count = len([span for span in chunk.evidence_spans if span.quote and span.quote.strip()])
    return max_conf * (1.0 + 0.5 * min(evidence_count, 6))


def _merge_risk_framing_chunks(
    chunks: Sequence[RiskFramingAnalysis],
    chunk_weights: Sequence[int] | None = None,
) -> RiskFramingAnalysis:
    if len(chunks) == 1:
        return chunks[0]

    valid_frames = load_taxonomy()["risk_framings"]
    # D4 #2: Weight framing chunks by framing evidence rather than raw character length.
    evidence_weights = [_chunk_framing_evidence_weight(chunk) for chunk in chunks]
    active_indices = [idx for idx, weight in enumerate(evidence_weights) if weight > 0.0]

    if active_indices:
        total_weight = sum(evidence_weights[idx] for idx in active_indices)
        used_weights = [(idx, evidence_weights[idx] / total_weight) for idx in active_indices]
    else:
        fallback = [max(w, 1) for w in chunk_weights] if chunk_weights else [1] * len(chunks)
        total_fb = float(sum(fallback)) or 1.0
        used_weights = [(idx, fallback[idx] / total_fb) for idx in range(len(chunks))]
        active_indices = list(range(len(chunks)))

    weighted_scores: dict[str, float] = {frame: 0.0 for frame in valid_frames}
    weighted_shares: dict[str, float] = {frame: 0.0 for frame in valid_frames}
    any_explicit_share = any(
        chunks[idx].frame_share is not None and sum(chunks[idx].frame_share.values()) > 1e-6
        for idx in active_indices
    )
    for idx, factor in used_weights:
        chunk = chunks[idx]
        for frame in valid_frames:
            weighted_scores[frame] += chunk.frame_confidence.get(frame, 0.0) * factor
        if any_explicit_share:
            chunk_share = (
                chunk.frame_share
                if chunk.frame_share is not None and sum(chunk.frame_share.values()) > 1e-6
                else normalize_frame_confidence(
                    chunk.frame_confidence,
                    valid_frames=valid_frames,
                    dominant_frame=chunk.dominant_frame,
                )
            )
            for frame in valid_frames:
                weighted_shares[frame] += chunk_share.get(frame, 0.0) * factor

    rounded_scores = {
        frame: round(min(max(score, 0.0), 1.0), 3)
        for frame, score in weighted_scores.items()
    }
    rounded_shares: dict[str, float] | None = None
    if any_explicit_share:
        share_total = sum(weighted_shares.values())
        if share_total > 1e-6:
            rounded_shares = {
                frame: round(weighted_shares[frame] / share_total, 4)
                for frame in valid_frames
            }
            # Ensure exact sum to 1.0 after rounding on the leading frame.
            top_share_frame = max(rounded_shares, key=lambda f: rounded_shares[f])
            drift = round(1.0 - sum(rounded_shares.values()), 4)
            rounded_shares[top_share_frame] = round(max(0.0, rounded_shares[top_share_frame] + drift), 4)

    ranked_frames = sorted(rounded_scores.items(), key=lambda item: (-item[1], item[0]))
    dominant_frame = ranked_frames[0][0]
    secondary_frames = [
        frame
        for frame, score in ranked_frames[1:]
        if score >= 0.25
    ][:3]

    # D4 #3: Aggregate evidence spans round-robin across ALL framing-bearing chunks (capped at 2/frame, 6 total).
    ordered_active_chunks = [
        chunks[idx]
        for idx, _ in sorted(used_weights, key=lambda item: (-item[1], item[0]))
    ]
    round_robin_spans: list[EvidenceSpan] = []
    max_span_len = max((len(chunk.evidence_spans) for chunk in ordered_active_chunks), default=0)
    for pos in range(max_span_len):
        for chunk in ordered_active_chunks:
            if pos < len(chunk.evidence_spans):
                round_robin_spans.append(chunk.evidence_spans[pos])

    per_frame_counts: Counter[str] = Counter()
    seen_quotes: set[str] = set()
    all_evidence: list[EvidenceSpan] = []
    for span in round_robin_spans:
        key = " ".join(span.quote.split()).lower()
        if not key or key in seen_quotes:
            continue
        frame_tag = span.frame or "__untagged__"
        if span.frame and per_frame_counts[frame_tag] >= MAX_EVIDENCE_SPANS_PER_LABEL:
            continue
        seen_quotes.add(key)
        per_frame_counts[frame_tag] += 1
        all_evidence.append(span)
        if len(all_evidence) >= MAX_EVIDENCE_SPANS_FRAMING:
            break

    # D4 #3: Aggregate rationales across ALL framing-bearing chunks, dropping no-framing escapes.
    rationales = _unique_preserving_order(
        [
            chunk.rationale_summary.strip()
            for chunk in ordered_active_chunks
            if chunk.rationale_summary.strip()
            and "no explicit framing language" not in chunk.rationale_summary.strip().lower()
        ]
    )
    if not rationales:
        rationales = _unique_preserving_order(
            [chunk.rationale_summary.strip() for chunk in chunks if chunk.rationale_summary.strip()]
        )
    return RiskFramingAnalysis(
        dominant_frame=dominant_frame,
        secondary_frames=secondary_frames,
        frame_confidence=rounded_scores,
        frame_share=rounded_shares,
        rationale_summary=" ".join(rationales),
        evidence_spans=all_evidence,
    )


@dataclass(frozen=True)
class _PreparedGroundingIndex:
    raw_text: str
    norm_text: str
    norm_to_raw: list[int]
    compact_text: str
    compact_to_raw: list[int]


_HYPHEN_CHARS = frozenset({"-", "\u00ad", "\u2010", "\u2011", "\u2012", "\u2013", "\u2014"})
_QUOTE_CHAR_MAP = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201a": "'",
    "\u201b": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u201e": '"',
    "\u201f": '"',
    "\xa0": " ",
}


def _normalize_single_char(ch: str) -> str:
    nfkc = unicodedata.normalize("NFKC", ch)
    out_chars: list[str] = []
    for sub in nfkc:
        mapped = _QUOTE_CHAR_MAP.get(sub, sub)
        out_chars.append(mapped.lower())
    return "".join(out_chars)


def _normalize_for_grounding(value: str) -> str:
    nfkc = unicodedata.normalize("NFKC", value)
    for src, dst in _QUOTE_CHAR_MAP.items():
        nfkc = nfkc.replace(src, dst)
    return " ".join(nfkc.split()).lower()


def _compact_for_grounding(value: str) -> str:
    norm = _normalize_for_grounding(value)
    out = [ch for ch in norm if ch not in _HYPHEN_CHARS and not ch.isspace()]
    return "".join(out)


def _build_normalized_index(plain_text: str) -> _PreparedGroundingIndex:
    norm_chars: list[str] = []
    norm_to_raw: list[int] = []
    compact_chars: list[str] = []
    compact_to_raw: list[int] = []
    in_space = True

    for raw_idx, raw_ch in enumerate(plain_text):
        expanded = _normalize_single_char(raw_ch)
        for ch in expanded:
            if ch.isspace():
                if not in_space:
                    norm_chars.append(" ")
                    norm_to_raw.append(raw_idx)
                    in_space = True
            else:
                norm_chars.append(ch)
                norm_to_raw.append(raw_idx)
                in_space = False
                if ch not in _HYPHEN_CHARS:
                    compact_chars.append(ch)
                    compact_to_raw.append(raw_idx)

    if norm_chars and norm_chars[-1] == " ":
        norm_chars.pop()
        norm_to_raw.pop()

    return _PreparedGroundingIndex(
        raw_text=plain_text,
        norm_text="".join(norm_chars),
        norm_to_raw=norm_to_raw,
        compact_text="".join(compact_chars),
        compact_to_raw=compact_to_raw,
    )


def _match_span_in_text(
    quote: str,
    plain_text: str,
    *,
    prepared_index: _PreparedGroundingIndex | None = None,
) -> tuple[str, int | None, int | None]:
    """Match a quote against source plain_text with NFKC, hyphen-insensitive, and ordered-window matching (D6)."""
    if not quote or not quote.strip() or not plain_text:
        return "not_found", None, None

    idx_obj = prepared_index or _build_normalized_index(plain_text)
    norm_quote = _normalize_for_grounding(quote)
    if not norm_quote:
        return "not_found", None, None

    # 1. Exact NFKC + whitespace-collapsed match -> verbatim
    pos = idx_obj.norm_text.find(norm_quote)
    if pos != -1:
        end_pos = pos + len(norm_quote) - 1
        start_raw = idx_obj.norm_to_raw[pos]
        end_raw = idx_obj.norm_to_raw[end_pos] + 1
        return "verbatim", start_raw, end_raw

    # 2. Whitespace- & hyphen-insensitive match (handles PDF line-wrap hyphens & spacing artifacts) -> approximate
    compact_quote = _compact_for_grounding(quote)
    if len(compact_quote) >= 6:
        cpos = idx_obj.compact_text.find(compact_quote)
        if cpos != -1:
            cend = cpos + len(compact_quote) - 1
            start_raw = idx_obj.compact_to_raw[cpos]
            end_raw = idx_obj.compact_to_raw[cend] + 1
            return "approximate", start_raw, end_raw

    # 3. Ordered-window clause matching for ellipsis-split or multi-clause quotes -> approximate
    raw_clauses = [
        clause.strip(" .,;:\"'()[]")
        for clause in re.split(r"\.{3,}|…|\[\.{3,}\]|\[…\]", norm_quote)
        if len(clause.strip(" .,;:\"'()[]")) >= 10
    ]
    if len(raw_clauses) >= 2:
        max_window = max(len(norm_quote) * 4, 2500)
        first_clause = raw_clauses[0]
        search_from = 0
        while True:
            first_pos = idx_obj.norm_text.find(first_clause, search_from)
            if first_pos == -1:
                break
            cursor = first_pos + len(first_clause)
            matched_all = True
            last_end = cursor - 1
            for clause in raw_clauses[1:]:
                next_pos = idx_obj.norm_text.find(clause, cursor)
                if next_pos == -1 or (next_pos + len(clause) - first_pos) > max_window:
                    matched_all = False
                    break
                cursor = next_pos + len(clause)
                last_end = cursor - 1
            if matched_all:
                return "approximate", idx_obj.norm_to_raw[first_pos], idx_obj.norm_to_raw[last_end] + 1
            search_from = first_pos + 1

    return "not_found", None, None


def _trim_verbatim_slice(
    plain_text: str,
    start_char: int,
    end_char: int,
) -> tuple[str, int, int]:
    """Return trimmed verbatim substring and adjusted offsets preserving plain_text[s:e] == quote."""
    s = max(0, start_char)
    e = min(len(plain_text), end_char)
    while s < e and plain_text[s].isspace():
        s += 1
    while e > s and plain_text[e - 1].isspace():
        e -= 1
    return plain_text[s:e], s, e


def ground_document_analysis(
    analysis: DocumentAnalysis,
    plain_text: str,
    *,
    snap_to_verbatim: bool = False,
) -> tuple[DocumentAnalysis, dict[str, Any]]:
    """Score grounding and persist per-span grounding_status, start_char, and end_char onto EvidenceSpans (D6).

    When `snap_to_verbatim=True`, spans matched via NFKC/whitespace/hyphen-insensitive or bounded
    ordered-window matching are deterministically snapped to the exact `plain_text[start_char:end_char]`
    substring when <= MAX_SNAP_QUOTE_CHARS (450 chars) so UI highlighters get exact verbatim matches.
    """
    prepared = _build_normalized_index(plain_text)
    exact_matches = 0
    fuzzy_matches = 0
    snapped_count = 0
    total_quotes = 0
    ungrounded_samples: list[str] = []

    def _annotate_span(span: EvidenceSpan) -> EvidenceSpan:
        nonlocal exact_matches, fuzzy_matches, snapped_count, total_quotes
        quote = span.quote.strip() if span.quote else ""
        if not quote:
            return span
        total_quotes += 1
        status, start_char, end_char = _match_span_in_text(quote, plain_text, prepared_index=prepared)
        final_quote = span.quote
        if (
            snap_to_verbatim
            and status in {"verbatim", "approximate"}
            and start_char is not None
            and end_char is not None
        ):
            snapped_text, snapped_start, snapped_end = _trim_verbatim_slice(plain_text, start_char, end_char)
            if snapped_text and len(snapped_text) <= MAX_SNAP_QUOTE_CHARS:
                if snapped_text != final_quote or status == "approximate":
                    snapped_count += 1
                final_quote = snapped_text
                start_char = snapped_start
                end_char = snapped_end
                status = "verbatim"

        if status == "verbatim":
            exact_matches += 1
        elif status == "approximate":
            fuzzy_matches += 1
        elif len(ungrounded_samples) < 5:
            ungrounded_samples.append(quote[:140])
        return span.model_copy(
            update={
                "quote": final_quote,
                "grounding_status": status,
                "start_char": start_char,
                "end_char": end_char,
            }
        )

    new_reqs = [
        req.model_copy(update={"evidence": [_annotate_span(span) for span in req.evidence]})
        for req in analysis.policy_extraction.safety_requirements
    ]
    new_enfs = [
        mech.model_copy(update={"evidence": [_annotate_span(span) for span in mech.evidence]})
        for mech in analysis.policy_extraction.enforcement_mechanisms
    ]
    new_framing_spans = [_annotate_span(span) for span in analysis.risk_framing.evidence_spans]

    annotated_analysis = analysis.model_copy(
        update={
            "policy_extraction": analysis.policy_extraction.model_copy(
                update={
                    "safety_requirements": new_reqs,
                    "enforcement_mechanisms": new_enfs,
                }
            ),
            "risk_framing": analysis.risk_framing.model_copy(
                update={"evidence_spans": new_framing_spans}
            ),
        }
    )

    ungrounded_quotes = total_quotes - exact_matches - fuzzy_matches
    # A12: Return None (never 1.0) when zero evidence quotes exist.
    exact_ratio = round(exact_matches / total_quotes, 3) if total_quotes else None
    grounding_ratio = round((exact_matches + fuzzy_matches) / total_quotes, 3) if total_quotes else None

    summary: dict[str, Any] = {
        "total_quotes": total_quotes,
        "exact_matches": exact_matches,
        "fuzzy_matches": fuzzy_matches,
        "ungrounded_quotes": ungrounded_quotes,
        "exact_ratio": exact_ratio,
        "grounding_ratio": grounding_ratio,
        "ungrounded_samples": ungrounded_samples,
    }
    if snap_to_verbatim:
        summary["snapped_quotes"] = snapped_count
    return annotated_analysis, summary


def score_document_grounding(
    analysis: DocumentAnalysis,
    plain_text: str,
) -> dict[str, Any]:
    """Verify whether extracted evidence quotes appear verbatim in the parsed source text (A12 + D6)."""
    _annotated, summary = ground_document_analysis(analysis, plain_text)
    return summary


def check_corpus_grounding(
    *,
    jurisdiction: str | None = None,
    document_id: str | None = None,
    min_ratio: float | None = None,
) -> dict[str, Any]:
    resolved_min_ratio = (
        float(min_ratio)
        if min_ratio is not None
        else get_canonical_thresholds()["grounding_pass_threshold"]
    )
    records = _load_parsed_document_records(jurisdiction=jurisdiction, document_id=document_id)
    if not records:
        raise ValueError("no parsed documents matched the requested filters")

    per_document: list[dict[str, Any]] = []
    flagged: list[dict[str, Any]] = []
    total_quotes = 0
    total_exact = 0
    total_fuzzy = 0

    for record in records:
        try:
            analysis, _raw_policy, _raw_framing = _load_analysis_artifacts(record)
        except (ValidationError, ValueError, RuntimeError, json.JSONDecodeError, OSError):
            continue
        score = score_document_grounding(analysis, record.parsed_document.plain_text)
        total_quotes += score["total_quotes"]
        total_exact += score["exact_matches"]
        total_fuzzy += score["fuzzy_matches"]
        entry = {
            "jurisdiction": record.jurisdiction,
            "document_id": record.document_id,
            "language": analysis.language,
            **score,
        }
        per_document.append(entry)
        ratio = score["grounding_ratio"]
        if (
            score["total_quotes"] == 0
            or ratio is None
            or ratio < resolved_min_ratio
            or score["ungrounded_quotes"] >= 3
        ):
            flagged.append(entry)

    return {
        "min_ratio_threshold": resolved_min_ratio,
        "document_count": len(per_document),
        "flagged_count": len(flagged),
        "total_quotes": total_quotes,
        "exact_matches": total_exact,
        "fuzzy_matches": total_fuzzy,
        "ungrounded_quotes": total_quotes - total_exact - total_fuzzy,
        "overall_exact_ratio": round(total_exact / total_quotes, 3) if total_quotes else None,
        "overall_grounding_ratio": round((total_exact + total_fuzzy) / total_quotes, 3) if total_quotes else None,
        "flagged_documents": sorted(
            flagged,
            key=lambda item: (
                -1.0 if item["grounding_ratio"] is None else item["grounding_ratio"],
                -item["ungrounded_quotes"],
            ),
        ),
        "documents": per_document,
    }


def export_json_schemas(output_dir: Path) -> list[str]:
    """Export Draft 2020-12 JSON Schemas derived from Pydantic models + live taxonomy."""
    output_dir.mkdir(parents=True, exist_ok=True)
    schemas = {
        "policy-extraction.schema.json": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://project-babel.com/schemas/policy-extraction.schema.json",
            **_policy_extraction_schema(),
        },
        "risk-framing.schema.json": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://project-babel.com/schemas/risk-framing.schema.json",
            **_risk_framing_schema(),
        },
        "document-analysis.schema.json": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://project-babel.com/schemas/document-analysis.schema.json",
            **DocumentAnalysis.model_json_schema(),
        },
        "jurisdiction-analysis.schema.json": {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://project-babel.com/schemas/jurisdiction-analysis.schema.json",
            **JurisdictionAnalysis.model_json_schema(),
        },
    }
    written: list[str] = []
    for filename, schema_payload in schemas.items():
        path = output_dir / filename
        path.write_text(
            json.dumps(schema_payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        written.append(repo_rel_posix(path))
    return written


def _precision_recall_f1(tp: int, fp: int, fn: int) -> tuple[float | None, float | None, float | None]:
    """Compute precision, recall, and F1, returning None (never 1.0) on empty sets (D12)."""
    precision = round(tp / (tp + fp), 3) if (tp + fp) > 0 else None
    recall = round(tp / (tp + fn), 3) if (tp + fn) > 0 else None
    denom = (2 * tp) + fp + fn
    f1 = round((2 * tp) / denom, 3) if denom > 0 else None
    return precision, recall, f1


def _cohens_kappa(gold_labels: Sequence[str], pred_labels: Sequence[str]) -> float | None:
    """Compute unweighted Cohen's kappa for nominal label agreement."""
    n = len(gold_labels)
    if n == 0 or n != len(pred_labels):
        return None
    observed = sum(1 for g, p in zip(gold_labels, pred_labels) if g == p) / n
    gold_counts = Counter(gold_labels)
    pred_counts = Counter(pred_labels)
    categories = set(gold_counts) | set(pred_counts)
    expected = sum((gold_counts[cat] / n) * (pred_counts[cat] / n) for cat in categories)
    if abs(1.0 - expected) < 1e-12:
        return None
    return round((observed - expected) / (1.0 - expected), 3)


def _krippendorffs_alpha_nominal(gold_labels: Sequence[str], pred_labels: Sequence[str]) -> float | None:
    """Compute nominal Krippendorff's alpha for two coders over N aligned items."""
    num_units = len(gold_labels)
    if num_units == 0 or num_units != len(pred_labels):
        return None
    observed_disagreement = sum(1 for g, p in zip(gold_labels, pred_labels) if g != p) / num_units
    total_values = 2 * num_units
    if total_values <= 1:
        return None
    combined_counts = Counter(gold_labels)
    combined_counts.update(pred_labels)
    expected_agreement = sum(count * (count - 1) for count in combined_counts.values()) / (
        total_values * (total_values - 1)
    )
    expected_disagreement = 1.0 - expected_agreement
    if expected_disagreement < 1e-12:
        return 1.0 if observed_disagreement < 1e-12 else 0.0
    return round(1.0 - (observed_disagreement / expected_disagreement), 3)


def _bootstrap_interval(
    values: Sequence[float],
) -> list[float] | None:
    if not values:
        return None
    ordered = sorted(values)
    n = len(ordered)
    low_idx = int(0.025 * (n - 1))
    high_idx = int(0.975 * (n - 1))
    return [round(ordered[low_idx], 3), round(ordered[high_idx], 3)]


def _load_gold_set_entries(gold_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not gold_path.exists():
        raise ValueError(f"gold set path does not exist: {gold_path}")

    bundle_meta: dict[str, Any] = {}
    if gold_path.is_file():
        payload = json.loads(gold_path.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and isinstance(payload.get("documents"), list):
            for meta_key in ("benchmark_id", "benchmark_status", "taxonomy_version", "created_at", "annotator_note"):
                if meta_key in payload:
                    bundle_meta[meta_key] = payload[meta_key]
            entries = list(payload["documents"])
        elif isinstance(payload, list):
            entries = list(payload)
        else:
            raise ValueError(f"unsupported gold set JSON structure in {gold_path}")
        if not entries:
            raise ValueError(f"no gold documents found in {gold_path}")
        return entries, bundle_meta

    if gold_path.is_dir():
        gold_files = sorted(gold_path.glob("*.json"))
        if not gold_files:
            raise ValueError(f"no gold fixture JSON files found in {gold_path}")
        entries = []
        for file_path in gold_files:
            item = json.loads(file_path.read_text(encoding="utf-8"))
            if isinstance(item, dict) and isinstance(item.get("documents"), list):
                entries.extend(item["documents"])
            else:
                entries.append(item)
        return entries, bundle_meta

    raise ValueError(f"gold set path is neither file nor directory: {gold_path}")


def evaluate_gold_set(
    gold_path: Path,
    *,
    n_bootstrap: int = 1000,
    seed: int = 42,
) -> dict[str, Any]:
    """Evaluate saved pipeline analyses against a gold-set bundle file or fixture directory (D12)."""
    gold_entries, bundle_meta = _load_gold_set_entries(gold_path)

    req_tp = req_fp = req_fn = 0
    enf_tp = enf_fp = enf_fn = 0
    per_label_req: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])  # [tp, fp, fn]
    per_label_enf: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    jur_stats: dict[str, dict[str, Any]] = {}
    dominant_gold_list: list[str] = []
    dominant_pred_list: list[str] = []
    binding_gold_list: list[str] = []
    binding_pred_list: list[str] = []
    per_doc_records: list[dict[str, Any]] = []
    details: list[dict[str, Any]] = []

    for gold in gold_entries:
        jurisdiction = gold["jurisdiction"]
        document_id = gold["document_id"]
        pred_path = ANALYSIS_DIR / jurisdiction / document_id / "document_analysis.json"
        if not pred_path.exists():
            details.append({"document_id": document_id, "jurisdiction": jurisdiction, "status": "missing_prediction"})
            continue

        pred = DocumentAnalysis.model_validate(json.loads(pred_path.read_text(encoding="utf-8")))
        j_bucket = jur_stats.setdefault(
            jurisdiction,
            {
                "evaluated_count": 0,
                "req_tp": 0,
                "req_fp": 0,
                "req_fn": 0,
                "enf_tp": 0,
                "enf_fp": 0,
                "enf_fn": 0,
                "per_label_req": defaultdict(lambda: [0, 0, 0]),
                "per_label_enf": defaultdict(lambda: [0, 0, 0]),
                "dom_hits": 0,
                "bind_hits": 0,
            },
        )
        j_bucket["evaluated_count"] += 1

        gold_reqs = set(gold.get("policy_requirements", gold.get("safety_requirements", [])))
        pred_reqs = {item.label for item in pred.policy_extraction.safety_requirements}
        doc_req_tp = len(gold_reqs & pred_reqs)
        doc_req_fp = len(pred_reqs - gold_reqs)
        doc_req_fn = len(gold_reqs - pred_reqs)
        req_tp += doc_req_tp
        req_fp += doc_req_fp
        req_fn += doc_req_fn
        j_bucket["req_tp"] += doc_req_tp
        j_bucket["req_fp"] += doc_req_fp
        j_bucket["req_fn"] += doc_req_fn
        for label in gold_reqs | pred_reqs:
            if label in gold_reqs and label in pred_reqs:
                per_label_req[label][0] += 1
                j_bucket["per_label_req"][label][0] += 1
            elif label in pred_reqs:
                per_label_req[label][1] += 1
                j_bucket["per_label_req"][label][1] += 1
            else:
                per_label_req[label][2] += 1
                j_bucket["per_label_req"][label][2] += 1

        gold_enfs = set(gold.get("enforcement_mechanisms", []))
        pred_enfs = {item.label for item in pred.policy_extraction.enforcement_mechanisms}
        doc_enf_tp = len(gold_enfs & pred_enfs)
        doc_enf_fp = len(pred_enfs - gold_enfs)
        doc_enf_fn = len(gold_enfs - pred_enfs)
        enf_tp += doc_enf_tp
        enf_fp += doc_enf_fp
        enf_fn += doc_enf_fn
        j_bucket["enf_tp"] += doc_enf_tp
        j_bucket["enf_fp"] += doc_enf_fp
        j_bucket["enf_fn"] += doc_enf_fn
        for label in gold_enfs | pred_enfs:
            if label in gold_enfs and label in pred_enfs:
                per_label_enf[label][0] += 1
                j_bucket["per_label_enf"][label][0] += 1
            elif label in pred_enfs:
                per_label_enf[label][1] += 1
                j_bucket["per_label_enf"][label][1] += 1
            else:
                per_label_enf[label][2] += 1
                j_bucket["per_label_enf"][label][2] += 1

        gold_dom = str(gold.get("dominant_frame") or "")
        pred_dom = pred.risk_framing.dominant_frame
        dom_match = pred_dom == gold_dom
        if dom_match:
            j_bucket["dom_hits"] += 1
        dominant_gold_list.append(gold_dom)
        dominant_pred_list.append(pred_dom)

        gold_bind = str(gold.get("binding_strength") or "")
        pred_bind = pred.policy_extraction.binding_strength
        bind_match = pred_bind == gold_bind
        if bind_match:
            j_bucket["bind_hits"] += 1
        binding_gold_list.append(gold_bind)
        binding_pred_list.append(pred_bind)

        per_doc_records.append(
            {
                "req_tp": doc_req_tp,
                "req_fp": doc_req_fp,
                "req_fn": doc_req_fn,
                "enf_tp": doc_enf_tp,
                "enf_fp": doc_enf_fp,
                "enf_fn": doc_enf_fn,
                "dom_gold": gold_dom,
                "dom_pred": pred_dom,
                "dom_match": dom_match,
                "bind_match": bind_match,
            }
        )
        detail_entry: dict[str, Any] = {
            "jurisdiction": jurisdiction,
            "document_id": document_id,
            "dominant_frame_match": dom_match,
            "gold_dominant_frame": gold_dom,
            "predicted_dominant_frame": pred_dom,
            "binding_strength_match": bind_match,
            "gold_binding_strength": gold_bind,
            "predicted_binding_strength": pred_bind,
            "missing_requirements": sorted(gold_reqs - pred_reqs),
            "extra_requirements": sorted(pred_reqs - gold_reqs),
            "missing_enforcement": sorted(gold_enfs - pred_enfs),
            "extra_enforcement": sorted(pred_enfs - gold_enfs),
        }
        if gold.get("language"):
            detail_entry["language"] = gold["language"]
        if gold.get("stratum"):
            detail_entry["stratum"] = gold["stratum"]
        details.append(detail_entry)

    evaluated = len(per_doc_records)
    req_p, req_r, req_f1 = _precision_recall_f1(req_tp, req_fp, req_fn)
    enf_p, enf_r, enf_f1 = _precision_recall_f1(enf_tp, enf_fp, enf_fn)

    def _summarize_per_label(table: dict[str, list[int]]) -> tuple[dict[str, dict[str, Any]], float | None]:
        summary: dict[str, dict[str, Any]] = {}
        macro_f1_values: list[float] = []
        for label in sorted(table):
            tp, fp, fn = table[label]
            p, r, f1 = _precision_recall_f1(tp, fp, fn)
            support = tp + fn
            summary[label] = {
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "support": support,
                "precision": p,
                "recall": r,
                "f1": f1,
            }
            if support > 0 and f1 is not None:
                macro_f1_values.append(f1)
        macro_f1 = round(sum(macro_f1_values) / len(macro_f1_values), 3) if macro_f1_values else None
        return summary, macro_f1

    per_label_req_summary, req_macro_f1 = _summarize_per_label(per_label_req)
    per_label_enf_summary, enf_macro_f1 = _summarize_per_label(per_label_enf)

    by_jurisdiction: dict[str, dict[str, Any]] = {}
    for jur_key in sorted(jur_stats):
        jb = jur_stats[jur_key]
        j_eval = jb["evaluated_count"]
        j_req_p, j_req_r, j_req_f1 = _precision_recall_f1(jb["req_tp"], jb["req_fp"], jb["req_fn"])
        j_enf_p, j_enf_r, j_enf_f1 = _precision_recall_f1(jb["enf_tp"], jb["enf_fp"], jb["enf_fn"])
        _, j_req_macro_f1 = _summarize_per_label(jb["per_label_req"])
        _, j_enf_macro_f1 = _summarize_per_label(jb["per_label_enf"])
        by_jurisdiction[jur_key] = {
            "evaluated_count": j_eval,
            "requirement_micro_precision": j_req_p,
            "requirement_micro_recall": j_req_r,
            "requirement_micro_f1": j_req_f1,
            "requirement_macro_f1": j_req_macro_f1,
            "enforcement_micro_precision": j_enf_p,
            "enforcement_micro_recall": j_enf_r,
            "enforcement_micro_f1": j_enf_f1,
            "enforcement_macro_f1": j_enf_macro_f1,
            "dominant_frame_accuracy": round(jb["dom_hits"] / j_eval, 3) if j_eval else None,
            "binding_strength_accuracy": round(jb["bind_hits"] / j_eval, 3) if j_eval else None,
        }

    dominant_hits = sum(1 for item in per_doc_records if item["dom_match"])
    binding_hits = sum(1 for item in per_doc_records if item["bind_match"])
    dom_accuracy = round(dominant_hits / evaluated, 3) if evaluated else None
    bind_accuracy = round(binding_hits / evaluated, 3) if evaluated else None
    dom_kappa = _cohens_kappa(dominant_gold_list, dominant_pred_list)
    bind_kappa = _cohens_kappa(binding_gold_list, binding_pred_list)
    dom_alpha = _krippendorffs_alpha_nominal(dominant_gold_list, dominant_pred_list)
    bind_alpha = _krippendorffs_alpha_nominal(binding_gold_list, binding_pred_list)

    # Seeded bootstrap 95% confidence intervals across evaluated documents.
    bootstrap_cis: dict[str, list[float] | None] = {
        "requirement_micro_f1": None,
        "enforcement_micro_f1": None,
        "dominant_frame_accuracy": None,
        "binding_strength_accuracy": None,
        "dominant_frame_cohens_kappa": None,
        "dominant_frame_krippendorffs_alpha": None,
    }
    if evaluated > 0 and n_bootstrap > 0:
        rng = random.Random(seed)
        boot_req_f1: list[float] = []
        boot_enf_f1: list[float] = []
        boot_dom_acc: list[float] = []
        boot_bind_acc: list[float] = []
        boot_dom_kappa: list[float] = []
        boot_dom_alpha: list[float] = []
        for _ in range(n_bootstrap):
            sample = [per_doc_records[rng.randrange(evaluated)] for _ in range(evaluated)]
            b_req_f1 = _precision_recall_f1(
                sum(s["req_tp"] for s in sample),
                sum(s["req_fp"] for s in sample),
                sum(s["req_fn"] for s in sample),
            )[2]
            if b_req_f1 is not None:
                boot_req_f1.append(b_req_f1)
            b_enf_f1 = _precision_recall_f1(
                sum(s["enf_tp"] for s in sample),
                sum(s["enf_fp"] for s in sample),
                sum(s["enf_fn"] for s in sample),
            )[2]
            if b_enf_f1 is not None:
                boot_enf_f1.append(b_enf_f1)
            boot_dom_acc.append(sum(1 for s in sample if s["dom_match"]) / evaluated)
            boot_bind_acc.append(sum(1 for s in sample if s["bind_match"]) / evaluated)
            sample_dom_gold = [s["dom_gold"] for s in sample]
            sample_dom_pred = [s["dom_pred"] for s in sample]
            b_kappa = _cohens_kappa(sample_dom_gold, sample_dom_pred)
            if b_kappa is not None:
                boot_dom_kappa.append(b_kappa)
            b_alpha = _krippendorffs_alpha_nominal(sample_dom_gold, sample_dom_pred)
            if b_alpha is not None:
                boot_dom_alpha.append(b_alpha)
        bootstrap_cis = {
            "requirement_micro_f1": _bootstrap_interval(boot_req_f1),
            "enforcement_micro_f1": _bootstrap_interval(boot_enf_f1),
            "dominant_frame_accuracy": _bootstrap_interval(boot_dom_acc),
            "binding_strength_accuracy": _bootstrap_interval(boot_bind_acc),
            "dominant_frame_cohens_kappa": _bootstrap_interval(boot_dom_kappa),
            "dominant_frame_krippendorffs_alpha": _bootstrap_interval(boot_dom_alpha),
        }

    return {
        **bundle_meta,
        "evaluated_count": evaluated,
        "bootstrap_iterations": n_bootstrap if evaluated > 0 else 0,
        "bootstrap_seed": seed,
        "requirement_micro_precision": req_p,
        "requirement_micro_recall": req_r,
        "requirement_micro_f1": req_f1,
        "requirement_macro_f1": req_macro_f1,
        "enforcement_micro_precision": enf_p,
        "enforcement_micro_recall": enf_r,
        "enforcement_micro_f1": enf_f1,
        "enforcement_macro_f1": enf_macro_f1,
        "dominant_frame_accuracy": dom_accuracy,
        "dominant_frame_cohens_kappa": dom_kappa,
        "dominant_frame_krippendorffs_alpha": dom_alpha,
        "binding_strength_accuracy": bind_accuracy,
        "binding_strength_cohens_kappa": bind_kappa,
        "binding_strength_krippendorffs_alpha": bind_alpha,
        "bootstrap_95_ci": bootstrap_cis,
        "by_jurisdiction": by_jurisdiction,
        "per_label_requirements": per_label_req_summary,
        "per_label_enforcement": per_label_enf_summary,
        "details": details,
    }


def _canonicalize_institution_name(name: str, *, jurisdiction: str | None = None) -> str:
    cleaned = " ".join(name.split()).strip()
    if not cleaned:
        return ""
    for pattern, canonical, allowed_jurisdictions in INSTITUTION_ALIAS_RULES:
        if jurisdiction is not None:
            if allowed_jurisdictions is not None and jurisdiction not in allowed_jurisdictions:
                continue
        elif canonical in JURISDICTION_REQUIRED_ALIAS_CANONICALS:
            # Ambiguous English phrases ("\bmost\b", "State Council") never match without explicit china scope.
            continue
        if pattern.search(cleaned):
            return canonical
    return cleaned


def _is_non_statutory_companion(item: JurisdictionDocumentRecord) -> bool:
    seed = item.parsed_record.seed_document
    if seed is not None:
        if seed.corpus_role in {"companion_resource", "draft_consultation", "historical_baseline", "subnational_overlay"}:
            return True
        if seed.lifecycle_stage in {"draft", "superseded"}:
            return True
        if seed.source_tier == "implementation_resource":
            return True
    title_lower = item.analysis.title.casefold()
    if any(marker in title_lower for marker in NON_STATUTORY_TITLE_MARKERS):
        return True
    return False


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
            newline="\n",
        )
        (output_dir / "jurisdiction_analysis.json").write_text(
            analysis.model_dump_json(indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
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
                        "status": f"persist_error:{type(exc).__name__}: {exc}",
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


def _load_jurisdiction_documents(
    jurisdiction: str,
    *,
    include_subnational: bool = False,
) -> list[JurisdictionDocumentRecord]:
    documents: list[JurisdictionDocumentRecord] = []
    for record in _load_parsed_document_records(jurisdiction=jurisdiction):
        corpus_role = (
            record.seed_document.corpus_role
            if record.seed_document is not None and record.seed_document.corpus_role
            else record.raw_metadata.get("corpus_role")
        )
        if not include_subnational and corpus_role == "subnational_overlay":
            continue
        try:
            analysis, _raw_policy_response, _raw_framing_response = _load_analysis_artifacts(record)
        except (ValidationError, ValueError, RuntimeError, json.JSONDecodeError, OSError):
            continue
        publication_date = (
            record.raw_metadata.get("publication_date")
            or record.raw_metadata.get("source_publication_date")
            or (record.seed_document.publication_date if record.seed_document else None)
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
    valid_frames = load_taxonomy()["risk_framings"]
    frame_mention_floor = get_canonical_thresholds()["frame_mention_floor"]
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
        seed = item.parsed_record.seed_document
        authoritative_binding = (
            seed.binding_strength if seed is not None and seed.binding_strength else extraction.binding_strength
        )
        document_type_counts[extraction.document_type] += 1
        binding_counts[authoritative_binding] += 1

        # Deduplicate canonical institutions per document (jurisdiction-scoped, D9).
        doc_institutions: set[str] = set()
        if extraction.issuing_body:
            canonical = _canonicalize_institution_name(extraction.issuing_body, jurisdiction=jurisdiction)
            if canonical:
                doc_institutions.add(canonical)
        for authority in extraction.enforcement_authorities:
            if authority:
                canonical = _canonicalize_institution_name(authority, jurisdiction=jurisdiction)
                if canonical:
                    doc_institutions.add(canonical)
        for inst in doc_institutions:
            institution_counts[inst] += 1

        for requirement in extraction.safety_requirements:
            requirement_counts[requirement.label] += 1
        for mechanism in extraction.enforcement_mechanisms:
            enforcement_counts[mechanism.label] += 1

        # Normalize per-document frame distribution so every document carries equal 1.0 frame weight.
        normalized_frames = normalize_frame_confidence(
            framing.frame_share if framing.frame_share else framing.frame_confidence,
            valid_frames=valid_frames,
            dominant_frame=framing.dominant_frame,
        )
        seen_frames: set[str] = set()
        for frame, norm_score in normalized_frames.items():
            if norm_score > 0.0:
                frame_score_totals[frame] += norm_score
            raw_score = framing.frame_confidence.get(frame, 0.0)
            if raw_score >= frame_mention_floor:
                seen_frames.add(frame)
        if framing.dominant_frame:
            seen_frames.add(framing.dominant_frame)
        for frame in seen_frames:
            frame_document_mentions[frame] += 1

        serialized_documents.append(
            {
                "document_id": item.parsed_record.document_id,
                "title": item.analysis.title,
                "publication_date": item.publication_date,
                "issuing_body": _canonicalize_institution_name(extraction.issuing_body, jurisdiction=jurisdiction),
                "document_type": extraction.document_type,
                "binding_strength": authoritative_binding,
                "corpus_role": item.parsed_record.seed_document.corpus_role if item.parsed_record.seed_document else None,
                "lifecycle_stage": item.parsed_record.seed_document.lifecycle_stage if item.parsed_record.seed_document else None,
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
        key=lambda item: (
            _source_salience(item, earliest_year=earliest, span_years=span),
            item.parsed_record.document_id,
        ),
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
    seed = item.parsed_record.seed_document
    effective_binding = (
        seed.binding_strength
        if seed is not None and seed.binding_strength
        else extraction.binding_strength
    )
    base = SOURCE_SALIENCE_WEIGHT.get(effective_binding, 2.0)

    # Strongly prioritize active primary instruments and demote drafts/superseded/companions/FAQs.
    if seed is not None:
        if seed.corpus_role == "primary_instrument":
            base += 2.5
        elif seed.corpus_role in {"companion_resource", "draft_consultation", "historical_baseline", "subnational_overlay"}:
            base -= 2.5
        if seed.lifecycle_stage == "active":
            base += 0.8
        elif seed.lifecycle_stage in {"draft", "superseded"}:
            base -= 2.0

    if _is_non_statutory_companion(item):
        base -= 1.5

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
    seed = item.parsed_record.seed_document
    prefix_map = {
        "binding_law": "Statutory anchor",
        "executive_action": "Executive coordination anchor",
        "regulatory_guidance": "Regulatory implementation anchor",
        "standards_guideline": "Standards and practice anchor",
        "voluntary_commitment": "Soft-law signal",
        "strategy_statement": "Strategic direction anchor",
    }
    effective_binding = (
        seed.binding_strength
        if seed is not None and seed.binding_strength
        else extraction.binding_strength
    )
    if _is_non_statutory_companion(item):
        if seed is not None and seed.lifecycle_stage == "draft":
            prefix = "Consultation draft"
        elif seed is not None and seed.lifecycle_stage == "superseded":
            prefix = "Historical reference"
        else:
            prefix = "Companion implementation resource"
    else:
        prefix = prefix_map.get(effective_binding, "Key source")

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
        return f"{prefix} {focus}, with {mechanisms[0]} as the clearest consequence or oversight hook."
    return f"{prefix} {focus}."


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


def _stable_text_hash(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


STALE_ANALYSIS_FILENAMES = (
    "document_analysis.json",
    "policy_extraction.json",
    "risk_framing.json",
    "policy_metadata.json",
    "policy_controls.json",
    "policy_response.raw.json",
    "framing_response.raw.json",
)


def _analysis_currency_status(
    *,
    analysis_path: Path,
    input_sha256: str,
    model: str,
    effort: str | None,
    taxonomy_hash: str,
    extraction_prompt_hash: str,
    framing_prompt_hash: str,
) -> tuple[bool, str]:
    """Determine whether an on-disk document_analysis.json matches current inputs and provenance (Section 0)."""
    if not analysis_path.exists():
        return False, "missing"
    try:
        payload = json.loads(analysis_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False, "invalid_json"

    provenance = payload.get("analysis_metadata")
    if not isinstance(provenance, dict):
        # Section 0: NEVER treat legacy artifacts lacking provenance as current.
        return False, "stale_legacy_no_provenance"

    is_current = (
        provenance.get("input_sha256") == input_sha256
        and provenance.get("model") == model
        and provenance.get("effort") == effort
        and provenance.get("taxonomy_hash") == taxonomy_hash
        and provenance.get("extraction_prompt_hash") == extraction_prompt_hash
        and provenance.get("framing_prompt_hash") == framing_prompt_hash
    )
    return (True, "current") if is_current else (False, "stale_inputs_changed")


def _existing_analysis_is_current(
    *,
    analysis_path: Path,
    input_sha256: str,
    model: str,
    effort: str | None,
    taxonomy_hash: str,
    extraction_prompt_hash: str,
    framing_prompt_hash: str,
) -> bool:
    is_current, _status = _analysis_currency_status(
        analysis_path=analysis_path,
        input_sha256=input_sha256,
        model=model,
        effort=effort,
        taxonomy_hash=taxonomy_hash,
        extraction_prompt_hash=extraction_prompt_hash,
        framing_prompt_hash=framing_prompt_hash,
    )
    return is_current


def _invoke_client_once(
    client: StructuredOutputClient,
    *,
    system_prompt: str,
    user_prompt: str,
    schema: dict[str, Any],
    max_tokens: int,
    system_prefix: str | None = None,
    cached_document_context: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    sig = inspect.signature(client.create_json_response)
    params = sig.parameters
    accepts_kwargs = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values())

    call_kwargs: dict[str, Any] = {
        "schema": schema,
        "max_tokens": max_tokens,
    }
    if accepts_kwargs or "system_prefix" in params:
        call_kwargs["system_prompt"] = system_prompt
        call_kwargs["system_prefix"] = system_prefix
    else:
        call_kwargs["system_prompt"] = (
            f"{system_prefix}\n\n{system_prompt}" if system_prefix else system_prompt
        )

    if accepts_kwargs or "cached_document_context" in params:
        call_kwargs["user_prompt"] = user_prompt
        call_kwargs["cached_document_context"] = cached_document_context
    else:
        call_kwargs["user_prompt"] = (
            f"{cached_document_context}\n\n{user_prompt}"
            if cached_document_context
            else user_prompt
        )

    return client.create_json_response(**call_kwargs)


def _write_text_atomic(path: Path, content: str) -> None:
    """Write UTF-8 LF text atomically via a thread-unique temp file + os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    try:
        tmp_path.write_text(content, encoding="utf-8", newline="\n")
        os.replace(tmp_path, path)
    except Exception:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise


def _call_structured_client(
    client: StructuredOutputClient,
    *,
    system_prompt: str,
    user_prompt: str,
    schema: dict[str, Any],
    max_tokens: int,
    system_prefix: str | None = None,
    cached_document_context: str | None = None,
    retry_on_max_tokens: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]]:
    retry_cap = int(getattr(client, "max_tokens_retry_cap", MAX_TOKENS_RETRY_CAP))
    try:
        return _invoke_client_once(
            client,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            schema=schema,
            max_tokens=max_tokens,
            system_prefix=system_prefix,
            cached_document_context=cached_document_context,
        )
    except MaxTokensTruncatedError:
        if not retry_on_max_tokens or max_tokens >= retry_cap:
            raise
        escalated_tokens = min(max(max_tokens * 2, 12288), retry_cap)
        return _invoke_client_once(
            client,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            schema=schema,
            max_tokens=escalated_tokens,
            system_prefix=system_prefix,
            cached_document_context=cached_document_context,
        )


def analyze_parsed_documents(
    *,
    jurisdiction: str | None = None,
    document_id: str | None = None,
    store: AnalysisStore | None = None,
    client: StructuredOutputClient | None = None,
    provider: str | None = None,
    model: str | None = None,
    effort: str | None = None,
    workers: int = 1,
    refresh_existing: bool = False,
) -> list[dict[str, str]]:
    records = _load_parsed_document_records(jurisdiction=jurisdiction, document_id=document_id)
    if not records:
        raise ValueError("no parsed documents matched the requested filters")

    if workers < 1 or workers > MAX_ANALYSIS_WORKERS:
        raise ValueError(f"workers must be between 1 and {MAX_ANALYSIS_WORKERS} (got {workers})")

    if client is None:
        client = create_llm_client(provider=provider, model=model, effort=effort)
    managed_store = False
    if store is None and os.getenv("DATABASE_URL"):
        store = PostgresAnalysisStore()
        managed_store = True

    (
        metadata_schema,
        controls_schema,
        framing_schema,
        shared_system_prefix,
        metadata_system_prompt,
        controls_system_prompt,
        framing_system_prompt,
    ) = _build_analysis_prompts()

    taxonomy_hash = _stable_text_hash(json.dumps(load_taxonomy(), ensure_ascii=False, sort_keys=True))
    taxonomy_version = get_taxonomy_version()
    combined_extraction_prompt = (
        f"{shared_system_prefix}\n\n---\n\n{metadata_system_prompt}\n\n---\n\n{controls_system_prompt}"
    )
    combined_framing_prompt = f"{shared_system_prefix}\n\n---\n\n{framing_system_prompt}"
    extraction_prompt_hash = _stable_text_hash(combined_extraction_prompt)
    framing_prompt_hash = _stable_text_hash(combined_framing_prompt)
    client_provider = getattr(client, "provider", "custom")
    client_model = getattr(client, "model", "unknown")
    client_effort = getattr(client, "effort", None)
    client_temperature = getattr(client, "temperature", None)

    direct_max_tokens = int(getattr(client, "direct_full_text_max_tokens", DIRECT_FULL_TEXT_MAX_TOKENS))
    direct_max_chars = int(getattr(client, "direct_full_text_max_chars", DIRECT_FULL_TEXT_MAX_CHARS))
    chunk_max_tokens = int(getattr(client, "chunk_max_tokens", CHUNK_MAX_TOKENS))
    chunk_max_chars = int(getattr(client, "chunk_max_chars", CHUNK_MAX_CHARS))
    meta_max_tokens = int(getattr(client, "metadata_max_tokens", POLICY_METADATA_MAX_TOKENS))
    ctrl_max_tokens = int(getattr(client, "controls_max_tokens", POLICY_CONTROLS_MAX_TOKENS))
    frame_max_tokens = int(getattr(client, "framing_max_tokens", RISK_FRAMING_MAX_TOKENS))

    results: list[dict[str, str]] = []
    touched_jurisdictions: set[str] = set()
    store_lock = threading.Lock()
    progress_lock = threading.Lock()
    total_records = len(records)
    completed_counter = {"count": 0}

    def _log_progress(record: ParsedDocumentRecord, status_label: str, elapsed_s: float) -> None:
        if workers <= 1:
            return
        with progress_lock:
            completed_counter["count"] += 1
            print(
                f"[{completed_counter['count']}/{total_records}] "
                f"{record.jurisdiction}/{record.document_id} -> {status_label} ({elapsed_s:.1f}s)",
                file=sys.stderr,
                flush=True,
            )

    def _process_one(
        record: ParsedDocumentRecord,
        active_store: AnalysisStore | None,
    ) -> tuple[dict[str, str], bool]:
        started = time.monotonic()
        target_dir = ANALYSIS_DIR / record.jurisdiction / record.document_id
        input_sha256 = _stable_text_hash(record.parsed_document.plain_text)

        is_current, currency_reason = _analysis_currency_status(
            analysis_path=target_dir / "document_analysis.json",
            input_sha256=input_sha256,
            model=client_model,
            effort=client_effort,
            taxonomy_hash=taxonomy_hash,
            extraction_prompt_hash=extraction_prompt_hash,
            framing_prompt_hash=framing_prompt_hash,
        )
        if not refresh_existing and is_current:
            _log_progress(record, "skipped_existing", time.monotonic() - started)
            return (
                {
                    "jurisdiction": record.jurisdiction,
                    "document_id": record.document_id,
                    "status": "skipped_existing",
                },
                False,
            )

        fidelity_issue = _analysis_fidelity_issue(record)
        if fidelity_issue is not None:
            # D10: Always remove stale analysis files when low-fidelity skip triggers.
            if target_dir.exists():
                for stale_name in STALE_ANALYSIS_FILENAMES:
                    stale_file = target_dir / stale_name
                    if stale_file.exists():
                        stale_file.unlink()
            _write_text_atomic(
                target_dir / "analysis_skipped.json",
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
            )
            _log_progress(record, f"skipped_low_fidelity ({fidelity_issue})", time.monotonic() - started)
            return (
                {
                    "jurisdiction": record.jurisdiction,
                    "document_id": record.document_id,
                    "status": "skipped_low_fidelity",
                },
                False,
            )

        chunks = _chunk_document_for_analysis(
            record,
            direct_max_chars=direct_max_chars,
            chunk_max_chars=chunk_max_chars,
            direct_max_tokens=direct_max_tokens,
            chunk_max_tokens=chunk_max_tokens,
        )
        chunk_count = len(chunks)
        metadata_chunks: list[PolicyMetadataExtraction] = []
        controls_chunks: list[PolicyControlsExtraction] = []
        framing_chunks: list[RiskFramingAnalysis] = []
        raw_metadata_responses: list[dict[str, Any]] = []
        raw_controls_responses: list[dict[str, Any]] = []
        raw_framing_responses: list[dict[str, Any]] = []

        try:
            for idx, chunk_text in enumerate(chunks, start=1):
                chunk_note = f"{idx}/{chunk_count}" if chunk_count > 1 else None
                # D8: Shared cacheable document context across all 3 calls for this chunk.
                cached_doc_ctx = _build_document_context_block(
                    record,
                    excerpt=chunk_text,
                    chunk_note=chunk_note,
                )
                metadata_payload, raw_meta_resp = _call_structured_client(
                    client,
                    system_prefix=shared_system_prefix,
                    system_prompt=metadata_system_prompt,
                    cached_document_context=cached_doc_ctx,
                    user_prompt=_build_task_trigger_prompt("policy_metadata", chunk_note=chunk_note),
                    schema=metadata_schema,
                    max_tokens=meta_max_tokens,
                )
                controls_payload, raw_ctrl_resp = _call_structured_client(
                    client,
                    system_prefix=shared_system_prefix,
                    system_prompt=controls_system_prompt,
                    cached_document_context=cached_doc_ctx,
                    user_prompt=_build_task_trigger_prompt("policy_controls", chunk_note=chunk_note),
                    schema=controls_schema,
                    max_tokens=ctrl_max_tokens,
                )
                framing_payload, raw_frame_resp = _call_structured_client(
                    client,
                    system_prefix=shared_system_prefix,
                    system_prompt=framing_system_prompt,
                    cached_document_context=cached_doc_ctx,
                    user_prompt=_build_task_trigger_prompt("risk_framing", chunk_note=chunk_note),
                    schema=framing_schema,
                    max_tokens=frame_max_tokens,
                )
                metadata_chunks.append(PolicyMetadataExtraction.model_validate(metadata_payload))
                controls_chunks.append(PolicyControlsExtraction.model_validate(controls_payload))
                framing_chunks.append(RiskFramingAnalysis.model_validate(framing_payload))
                raw_metadata_responses.append(raw_meta_resp)
                raw_controls_responses.append(raw_ctrl_resp)
                raw_framing_responses.append(raw_frame_resp)

            metadata_extraction = _merge_policy_metadata_chunks(metadata_chunks)
            controls_extraction = _merge_policy_controls_chunks(
                controls_chunks,
                plain_text=record.parsed_document.plain_text,
            )
            framing = _merge_risk_framing_chunks(framing_chunks, [len(chunk) for chunk in chunks])

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
            _validate_taxonomy_alignment(extraction, framing)
        except (ValidationError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
            # D3: Record full exception type + message in status.
            status = f"analysis_error:{type(exc).__name__}: {exc}"
            _log_progress(record, status, time.monotonic() - started)
            return (
                {
                    "jurisdiction": record.jurisdiction,
                    "document_id": record.document_id,
                    "status": status,
                },
                False,
            )

        raw_policy_response: dict[str, Any] = {
            "provider": client_provider,
            "model": client_model,
            "effort": client_effort,
            "metadata_response": raw_metadata_responses[0] if chunk_count == 1 else raw_metadata_responses,
            "controls_response": raw_controls_responses[0] if chunk_count == 1 else raw_controls_responses,
        }
        raw_framing_response: dict[str, Any] = (
            raw_framing_responses[0]
            if chunk_count == 1
            else {"provider": client_provider, "model": client_model, "effort": client_effort, "chunks": raw_framing_responses}
        )
        usage_summary = _accumulate_usage(
            [*raw_metadata_responses, *raw_controls_responses, *raw_framing_responses],
            provider=client_provider,
        )

        preliminary_analysis = DocumentAnalysis(
            source_id=record.document_id,
            title=record.raw_metadata.get("title", record.parsed_document.title),
            language=_primary_language(record),
            policy_extraction=extraction,
            risk_framing=framing,
        )
        # D6 + Stage 4A: Ground, snap approximate spans to exact verbatim substrings (<=450 chars), and persist offsets.
        grounded_analysis, grounding_summary = ground_document_analysis(
            preliminary_analysis,
            record.parsed_document.plain_text,
            snap_to_verbatim=True,
        )
        analyzed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        provenance = AnalysisProvenance(
            provider=client_provider,
            model=client_model,
            effort=client_effort,
            temperature=client_temperature,
            analyzed_at=analyzed_at,
            analysis_version=PIPELINE_ANALYSIS_VERSION,
            taxonomy_version=taxonomy_version,
            taxonomy_hash=taxonomy_hash,
            extraction_prompt_hash=extraction_prompt_hash,
            framing_prompt_hash=framing_prompt_hash,
            input_sha256=input_sha256,
            chunked=chunk_count > 1,
            chunk_count=chunk_count,
            usage=usage_summary,
            grounding_summary=grounding_summary,
        )
        analysis = grounded_analysis.model_copy(update={"analysis_metadata": provenance})

        target_dir.mkdir(parents=True, exist_ok=True)
        skip_marker = target_dir / "analysis_skipped.json"
        if skip_marker.exists():
            skip_marker.unlink()

        _write_text_atomic(
            target_dir / "policy_extraction.json",
            analysis.policy_extraction.model_dump_json(indent=2, ensure_ascii=False) + "\n",
        )
        _write_text_atomic(
            target_dir / "risk_framing.json",
            analysis.risk_framing.model_dump_json(indent=2, ensure_ascii=False) + "\n",
        )
        _write_text_atomic(
            target_dir / "document_analysis.json",
            analysis.model_dump_json(indent=2, ensure_ascii=False) + "\n",
        )
        _write_text_atomic(
            target_dir / "policy_metadata.json",
            metadata_extraction.model_dump_json(indent=2, ensure_ascii=False) + "\n",
        )
        _write_text_atomic(
            target_dir / "policy_controls.json",
            controls_extraction.model_dump_json(indent=2, ensure_ascii=False) + "\n",
        )
        _write_text_atomic(
            target_dir / "policy_response.raw.json",
            json.dumps(raw_policy_response, indent=2, ensure_ascii=False) + "\n",
        )
        _write_text_atomic(
            target_dir / "framing_response.raw.json",
            json.dumps(raw_framing_response, indent=2, ensure_ascii=False) + "\n",
        )

        if active_store is not None:
            try:
                bundle = build_analysis_persistence_bundle(
                    document_id=record.document_id,
                    jurisdiction=record.jurisdiction,
                    title=record.raw_metadata.get("title", record.parsed_document.title),
                    canonical_url=_source_url(record),
                    language=_primary_language(record),
                    parser_version=record.parsed_document.parser_version,
                    raw_artifact_path=record.parsed_document.source_artifact_path,
                    normalized_text_path=repo_rel_posix(record.parsed_path),
                    normalized_text=record.parsed_document.plain_text,
                    raw_metadata=record.raw_metadata,
                    extraction=analysis.policy_extraction,
                    framing=analysis.risk_framing,
                    raw_policy_response=raw_policy_response,
                    raw_framing_response=raw_framing_response,
                    analysis_metadata=provenance,
                    binding_strength=record.seed_document.binding_strength if record.seed_document else None,
                    sections=[section.model_dump(mode="json") for section in record.parsed_document.sections],
                    parser_warnings=record.parsed_document.warnings,
                    source_tier=record.seed_document.source_tier if record.seed_document else None,
                    corpus_role=record.seed_document.corpus_role if record.seed_document else None,
                    subnational_unit=record.seed_document.subnational_unit if record.seed_document else None,
                    supersedes_id=record.seed_document.supersedes_id if record.seed_document else None,
                    lifecycle_stage=record.seed_document.lifecycle_stage if record.seed_document else None,
                    grounding_ratio=grounding_summary["grounding_ratio"],
                )
                with store_lock:
                    active_store.persist_analysis_bundle(bundle)
            except Exception as exc:
                status = f"persist_error:{type(exc).__name__}: {exc}"
                _log_progress(record, status, time.monotonic() - started)
                return (
                    {
                        "jurisdiction": record.jurisdiction,
                        "document_id": record.document_id,
                        "status": status,
                    },
                    False,
                )

        result_entry = {
            "jurisdiction": record.jurisdiction,
            "document_id": record.document_id,
            "status": "analyzed",
        }
        if currency_reason == "stale_legacy_no_provenance":
            result_entry["previous_status"] = "stale_legacy_no_provenance"
        ratio = grounding_summary.get("grounding_ratio")
        ratio_str = f"{ratio:.1%}" if isinstance(ratio, (int, float)) else "n/a"
        _log_progress(
            record,
            f"analyzed (chunks={chunk_count}, grounded={ratio_str})",
            time.monotonic() - started,
        )
        return result_entry, True

    def _run_batch(active_store: AnalysisStore | None) -> None:
        if workers == 1 or len(records) <= 1:
            for record in records:
                entry, touched = _process_one(record, active_store)
                results.append(entry)
                if touched:
                    touched_jurisdictions.add(record.jurisdiction)
        else:
            ordered_entries: list[dict[str, str] | None] = [None] * len(records)
            with ThreadPoolExecutor(max_workers=workers) as executor:
                future_to_idx = {
                    executor.submit(_process_one, record, active_store): idx
                    for idx, record in enumerate(records)
                }
                for future in as_completed(future_to_idx):
                    idx = future_to_idx[future]
                    entry, touched = future.result()
                    ordered_entries[idx] = entry
                    if touched:
                        touched_jurisdictions.add(records[idx].jurisdiction)
            results.extend(entry for entry in ordered_entries if entry is not None)

        for touched_jurisdiction in sorted(touched_jurisdictions):
            results.extend(
                analyze_jurisdictions(
                    jurisdiction=touched_jurisdiction,
                    store=active_store,
                    refresh_existing=True,
                )
            )

    if managed_store and isinstance(store, PostgresAnalysisStore):
        with store as active_store:
            _run_batch(active_store)
    else:
        _run_batch(store)

    return results


def _collect_ungrounded_quotes(analysis: DocumentAnalysis) -> list[str]:
    ungrounded: list[str] = []
    for req in analysis.policy_extraction.safety_requirements:
        for span in req.evidence:
            if span.grounding_status not in {"verbatim", "approximate"}:
                ungrounded.append(f"safety_requirements[{req.label}]: {span.quote!r}")
    for enf in analysis.policy_extraction.enforcement_mechanisms:
        for span in enf.evidence:
            if span.grounding_status not in {"verbatim", "approximate"}:
                ungrounded.append(f"enforcement_mechanisms[{enf.label}]: {span.quote!r}")
    for idx, span in enumerate(analysis.risk_framing.evidence_spans):
        if span.grounding_status not in {"verbatim", "approximate"}:
            frame_label = span.frame or f"span#{idx}"
            ungrounded.append(f"risk_framing[{frame_label}]: {span.quote!r}")
    return ungrounded


def ingest_document_analysis(
    *,
    jurisdiction: str,
    document_id: str,
    input_json_path: Path,
    provider: str = "gemini",
    model: str = DEFAULT_GEMINI_MODEL,
    effort: str | None = "xhigh",
    min_grounding: float = 0.90,
    schemas_dir: Path = SCHEMAS_DIR,
) -> dict[str, Any]:
    """Validate, ground, stamp authentic v2.1.0 provenance, and atomically persist a single document analysis."""
    if not (0.0 <= min_grounding <= 1.0):
        raise ValueError(f"min_grounding must be between 0.0 and 1.0 (got {min_grounding})")
    if not input_json_path.exists():
        raise ValueError(f"input JSON file not found: {input_json_path}")

    raw_payload = json.loads(input_json_path.read_text(encoding="utf-8"))
    if not isinstance(raw_payload, dict):
        raise ValueError("input JSON must be an object containing 'policy_extraction' and 'risk_framing'")
    raw_policy = raw_payload.get("policy_extraction")
    raw_framing = raw_payload.get("risk_framing")
    if not isinstance(raw_policy, dict) or not isinstance(raw_framing, dict):
        raise ValueError("input JSON must contain object fields 'policy_extraction' and 'risk_framing'")

    records = _load_parsed_document_records(jurisdiction=jurisdiction, document_id=document_id)
    if not records:
        raise ValueError(f"parsed document not found for {jurisdiction}/{document_id}")
    record = records[0]

    policy_payload = dict(raw_policy)
    if "jurisdiction" not in policy_payload or policy_payload["jurisdiction"] is None:
        policy_payload["jurisdiction"] = record.jurisdiction
    elif policy_payload["jurisdiction"] != record.jurisdiction:
        raise ValueError(
            f"policy_extraction.jurisdiction '{policy_payload['jurisdiction']}' does not match '{record.jurisdiction}'"
        )

    extraction = PolicyExtraction.model_validate(policy_payload)
    framing = RiskFramingAnalysis.model_validate(raw_framing)
    _validate_taxonomy_alignment(extraction, framing)

    preliminary_analysis = DocumentAnalysis(
        source_id=record.document_id,
        title=record.raw_metadata.get("title", record.parsed_document.title),
        language=_primary_language(record),
        policy_extraction=extraction,
        risk_framing=framing,
    )
    grounded_analysis, grounding_summary = ground_document_analysis(
        preliminary_analysis,
        record.parsed_document.plain_text,
        snap_to_verbatim=True,
    )

    grounding_ratio = grounding_summary.get("grounding_ratio")
    if grounding_ratio is None or float(grounding_ratio) < min_grounding:
        ratio_display = f"{float(grounding_ratio):.3f}" if grounding_ratio is not None else "None"
        ungrounded_list = _collect_ungrounded_quotes(grounded_analysis)
        lines = [
            f"grounding gate failed for {record.jurisdiction}/{record.document_id}: "
            f"grounding_ratio={ratio_display} < min_grounding={min_grounding:.2f} "
            f"(exact={grounding_summary['exact_matches']}/{grounding_summary['total_quotes']}, "
            f"ungrounded={grounding_summary['ungrounded_quotes']})"
        ]
        for entry in ungrounded_list:
            lines.append(f"  ungrounded: {entry}")
        raise ValueError("\n".join(lines))

    (
        _metadata_schema,
        _controls_schema,
        _framing_schema,
        shared_system_prefix,
        metadata_system_prompt,
        controls_system_prompt,
        framing_system_prompt,
    ) = _build_analysis_prompts()

    taxonomy_hash = _stable_text_hash(json.dumps(load_taxonomy(), ensure_ascii=False, sort_keys=True))
    taxonomy_version = get_taxonomy_version()
    combined_extraction_prompt = (
        f"{shared_system_prefix}\n\n---\n\n{metadata_system_prompt}\n\n---\n\n{controls_system_prompt}"
    )
    combined_framing_prompt = f"{shared_system_prefix}\n\n---\n\n{framing_system_prompt}"
    extraction_prompt_hash = _stable_text_hash(combined_extraction_prompt)
    framing_prompt_hash = _stable_text_hash(combined_framing_prompt)
    input_sha256 = _stable_text_hash(record.parsed_document.plain_text)
    analyzed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    total_chars = len(record.parsed_document.plain_text)

    provenance = AnalysisProvenance(
        provider=provider,
        model=model,
        effort=effort,
        temperature=DEFAULT_TEMPERATURE,
        analyzed_at=analyzed_at,
        analysis_version=PIPELINE_ANALYSIS_VERSION,
        taxonomy_version=taxonomy_version,
        taxonomy_hash=taxonomy_hash,
        extraction_prompt_hash=extraction_prompt_hash,
        framing_prompt_hash=framing_prompt_hash,
        input_sha256=input_sha256,
        chunked=False,
        chunk_count=1,
        usage={
            "execution_mode": "subscription_harness",
            "total_chars": total_chars,
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
            "thoughts_tokens": 0,
            "estimated_cost_usd": 0.0,
        },
        grounding_summary=grounding_summary,
    )
    analysis = grounded_analysis.model_copy(update={"analysis_metadata": provenance})

    schema_errors = validate_document_analysis_payload(
        analysis.model_dump(mode="json"),
        schemas_dir=schemas_dir,
    )
    if schema_errors:
        formatted = "\n".join(f"  {err['path']}: {err['message']}" for err in schema_errors)
        raise ValueError(
            f"document-analysis.schema.json validation failed for {record.jurisdiction}/{record.document_id}:\n{formatted}"
        )

    target_dir = ANALYSIS_DIR / record.jurisdiction / record.document_id
    target_dir.mkdir(parents=True, exist_ok=True)
    _write_text_atomic(
        target_dir / "policy_extraction.json",
        analysis.policy_extraction.model_dump_json(indent=2, ensure_ascii=False) + "\n",
    )
    _write_text_atomic(
        target_dir / "risk_framing.json",
        analysis.risk_framing.model_dump_json(indent=2, ensure_ascii=False) + "\n",
    )
    _write_text_atomic(
        target_dir / "document_analysis.json",
        analysis.model_dump_json(indent=2, ensure_ascii=False) + "\n",
    )

    for stale_name in (
        "analysis_skipped.json",
        "policy_response.raw.json",
        "framing_response.raw.json",
        "policy_metadata.json",
        "policy_controls.json",
    ):
        stale_file = target_dir / stale_name
        if stale_file.exists():
            stale_file.unlink()

    return {
        "jurisdiction": record.jurisdiction,
        "document_id": record.document_id,
        "status": "ingested",
        "output_path": repo_rel_posix(target_dir / "document_analysis.json"),
        "provider": provider,
        "model": model,
        "effort": effort,
        "total_chars": total_chars,
        "grounding_ratio": grounding_summary["grounding_ratio"],
        "exact_ratio": grounding_summary["exact_ratio"],
        "total_quotes": grounding_summary["total_quotes"],
        "exact_matches": grounding_summary["exact_matches"],
        "snapped_quotes": grounding_summary["snapped_quotes"],
        "ungrounded_quotes": grounding_summary["ungrounded_quotes"],
    }


def persist_analysis_artifacts(
    *,
    jurisdiction: str | None = None,
    document_id: str | None = None,
    store: AnalysisStore | None = None,
    allow_legacy: bool = False,
) -> list[dict[str, str]]:
    records = _load_parsed_document_records(jurisdiction=jurisdiction, document_id=document_id)
    if not records:
        raise ValueError("no parsed documents matched the requested filters")

    managed_store = False
    if store is None:
        store = PostgresAnalysisStore()
        managed_store = True

    results: list[dict[str, str]] = []
    touched_jurisdictions: set[str] = set()

    def _run_persist(active_store: AnalysisStore) -> None:
        for record in records:
            try:
                analysis, raw_policy_response, raw_framing_response = _load_analysis_artifacts(record)
                extraction = analysis.policy_extraction
                framing = analysis.risk_framing
                _validate_taxonomy_alignment(extraction, framing)

                if analysis.analysis_metadata is None and not allow_legacy:
                    raise LegacyProvenanceError(
                        f"refusing to persist legacy analysis for '{record.document_id}' without "
                        "analysis_metadata; re-run analyze-documents or pass --allow-legacy"
                    )

                provider, model, effort = _artifact_runtime_metadata(
                    analysis=analysis,
                    raw_policy_response=raw_policy_response,
                    raw_framing_response=raw_framing_response,
                )
                grounding = score_document_grounding(analysis, record.parsed_document.plain_text)
                bundle = build_analysis_persistence_bundle(
                    document_id=record.document_id,
                    jurisdiction=record.jurisdiction,
                    title=record.raw_metadata.get("title", record.parsed_document.title),
                    canonical_url=_source_url(record),
                    language=_primary_language(record),
                    parser_version=record.parsed_document.parser_version,
                    raw_artifact_path=record.parsed_document.source_artifact_path,
                    normalized_text_path=repo_rel_posix(record.parsed_path),
                    normalized_text=record.parsed_document.plain_text,
                    raw_metadata=record.raw_metadata,
                    extraction=extraction,
                    framing=framing,
                    raw_policy_response=raw_policy_response,
                    raw_framing_response=raw_framing_response,
                    analysis_metadata=analysis.analysis_metadata,
                    allow_legacy=allow_legacy,
                    provider=provider,
                    model=model,
                    effort=effort,
                    binding_strength=record.seed_document.binding_strength if record.seed_document else None,
                    sections=[section.model_dump(mode="json") for section in record.parsed_document.sections],
                    parser_warnings=record.parsed_document.warnings,
                    source_tier=record.seed_document.source_tier if record.seed_document else None,
                    corpus_role=record.seed_document.corpus_role if record.seed_document else None,
                    subnational_unit=record.seed_document.subnational_unit if record.seed_document else None,
                    supersedes_id=record.seed_document.supersedes_id if record.seed_document else None,
                    lifecycle_stage=record.seed_document.lifecycle_stage if record.seed_document else None,
                    grounding_ratio=grounding["grounding_ratio"],
                )
                active_store.persist_analysis_bundle(bundle)
            except LegacyProvenanceError:
                raise
            except Exception as exc:
                results.append(
                    {
                        "jurisdiction": record.jurisdiction,
                        "document_id": record.document_id,
                        "status": f"persist_error:{type(exc).__name__}: {exc}",
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
                    store=active_store,
                    refresh_existing=True,
                )
            )

    if managed_store and isinstance(store, PostgresAnalysisStore):
        with store as active_store:
            _run_persist(active_store)
    else:
        _run_persist(store)

    return results


def _load_analysis_artifacts(
    record: ParsedDocumentRecord,
) -> tuple[DocumentAnalysis, dict[str, Any], dict[str, Any]]:
    analysis_dir = ANALYSIS_DIR / record.jurisdiction / record.document_id
    # D10: Honor analysis_skipped.json even if stale JSON artifacts were ever left behind.
    if (analysis_dir / "analysis_skipped.json").exists():
        raise ValueError(f"analysis skipped due to low fidelity for '{record.document_id}'")
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


def _nested_response_field(payload: dict[str, Any], key: str) -> str | None:
    direct = payload.get(key)
    if isinstance(direct, str) and direct:
        return direct
    for container_key in ("metadata_response", "controls_response"):
        nested = payload.get(container_key)
        if isinstance(nested, dict):
            value = nested.get(key)
            if isinstance(value, str) and value:
                return value
        elif isinstance(nested, list):
            for entry in nested:
                if isinstance(entry, dict):
                    value = entry.get(key)
                    if isinstance(value, str) and value:
                        return value
    return None


def _artifact_runtime_metadata(
    *,
    analysis: DocumentAnalysis | None = None,
    raw_policy_response: dict[str, Any],
    raw_framing_response: dict[str, Any],
) -> tuple[str, str, str | None]:
    if analysis is not None and analysis.analysis_metadata is not None:
        meta = analysis.analysis_metadata
        return meta.provider, meta.model, meta.effort

    model = (
        _first_string(
            _nested_response_field(raw_policy_response, "model"),
            _nested_response_field(raw_framing_response, "model"),
        )
        or "artifact-replay"
    )
    provider = _first_string(
        _nested_response_field(raw_policy_response, "provider"),
        _nested_response_field(raw_framing_response, "provider"),
    )
    if provider is None:
        if model.startswith("claude"):
            provider = "anthropic"
        elif model.startswith("gemini"):
            provider = "gemini"
        else:
            provider = "artifact-replay"

    # Section 0: Never fabricate effort from current env vars for legacy artifacts.
    effort = _first_string(
        _nested_response_field(raw_policy_response, "effort"),
        _nested_response_field(raw_framing_response, "effort"),
    )

    return provider, model, effort


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value:
            return value
    return None
