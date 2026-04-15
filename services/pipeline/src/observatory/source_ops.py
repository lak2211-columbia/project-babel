from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from observatory.coverage import DISCOVERY_DIR, build_source_inventory
from observatory.source_registry import ROOT, SourcePortal, load_all_source_manifests


JURISDICTION_TARGET_RANGES = {
    "united_states": {"minimum": 40, "target": 55, "maximum": 70},
    "european_union": {"minimum": 40, "target": 60, "maximum": 80},
    "japan": {"minimum": 40, "target": 55, "maximum": 70},
    "south_korea": {"minimum": 25, "target": 35, "maximum": 50},
    "china": {"minimum": 30, "target": 45, "maximum": 60},
}

AI_RELEVANCE_KEYWORDS = (
    "artificial intelligence",
    "generative ai",
    "general-purpose ai",
    "general purpose ai",
    "gpai",
    "foundation model",
    "frontier model",
    "algorithm",
    "algorithms",
    "machine learning",
    "chatbot",
    "ai ",
    "/ai",
    " ai/",
    "인공지능",
    "생성형",
    "알고리즘",
    "人工知能",
    "生成ai",
    "生成 ai",
    "アルゴリズム",
    "人工智能",
    "生成式",
    "算法",
)

PRIMARY_INSTRUMENT_KEYWORDS = (
    "act",
    "law",
    "regulation",
    "regulations",
    "rule",
    "rules",
    "measure",
    "measures",
    "provision",
    "provisions",
    "decree",
    "directive",
    "ordinance",
    "circular",
    "opinion",
    "guidance",
    "guideline",
    "guidelines",
    "framework",
    "standard",
    "standards",
    "code of practice",
    "playbook",
    "profile",
    "checklist",
    "template",
    "principles",
    "strategy",
    "plan",
    "report",
    "manual",
    "handbook",
    "faq",
    "q&a",
    "법",
    "법률",
    "시행령",
    "고시",
    "가이드라인",
    "지침",
    "안내",
    "안내서",
    "원칙",
    "기본계획",
    "조치",
    "의견",
    "질의응답",
    "人工知能",
    "ガイドライン",
    "指針",
    "手引",
    "法",
    "法律",
    "方針",
    "戦略",
    "報告書",
    "办法",
    "措施",
    "规定",
    "条例",
    "意见",
    "指南",
    "标准",
    "框架",
    "计划",
    "问答",
)

FAQ_KEYWORDS = ("faq", "q&a", "questions & answers", "questions and answers", "질의응답", "問答")
PRESS_RELEASE_KEYWORDS = (
    "news",
    "press release",
    "press releases",
    "announces",
    "announcement",
    "supporting implementation",
    "보도자료",
    "新闻",
)
TOOL_KEYWORDS = (
    "tool",
    "service desk",
    "explorer",
    "wizard",
    "search",
    "whistleblower",
    "request",
    "desk",
)
STRUCTURAL_LOW_SIGNAL_KEYWORDS = (
    "移動ページ",
    "開催状況",
    "予算の推移",
    "headquarters",
    "strategy headquarters",
    "strategy team",
    "人工知能戦略推進会議",
    "戦略本部",
    "戦略チーム",
    "関係省庁連携",
)
DOWNLOAD_INDEX_KEYWORDS = (
    "一覧",
    "source index",
    "list of",
)
HUB_KEYWORDS = (
    "artificial intelligence",
    "ai office",
    "resources",
    "policy",
    "about",
    "portal",
    "in this section",
    "library",
    "governance and enforcement",
)
CONSULTATION_KEYWORDS = (
    "draft",
    "consultation",
    "call for comments",
    "public consultation",
    "request for an article",
    " 의견수렴",
    "征求意见",
)
LOW_SIGNAL_KEYWORDS = (
    "event",
    "events",
    "meeting",
    "meetings",
    "conference",
    "speech",
    "remarks",
    "held",
    "funding",
    "grant",
    "開催",
    "会議",
    "開催しました",
    "회의",
    "행사",
    "召开",
)
LANGUAGE_MARKERS = (
    "english",
    "french",
    "german",
    "spanish",
    "italian",
    "dutch",
    "portuguese",
    "romanian",
    "bulgarian",
    "croatian",
    "czech",
    "danish",
    "estonian",
    "finnish",
    "greek",
    "hungarian",
    "latvian",
    "lithuanian",
    "maltese",
    "polish",
    "slovak",
    "slovene",
    "japanese",
    "korean",
    "chinese",
)

POLICY_DOMAIN_HINTS = {
    "privacy_data_protection": ("privacy", "personal data", "gdpr", "data protection", "個人情報", "개인정보", "个人信息"),
    "copyright_ip": ("copyright", "intellectual property", "著作権", "저작권", "版权"),
    "healthcare_medical_devices": ("medical", "health", "healthcare", "医療", "의료", "医药", "medical device", "digital health"),
    "finance": ("finance", "financial", "credit", "consumer finance", "bank", "adverse action"),
    "national_security": ("security", "defense", "export control", "biosecurity", "national security", "국방"),
    "public_sector_governance": ("government", "public sector", "administrative", "agency", "ministry", "ministries"),
    "public_sector_procurement": ("procurement", "vendor", "supplier", "public purchase"),
    "standards_assurance": ("standard", "standards", "framework", "profile", "playbook", "code of practice", "template"),
    "consumer_protection": ("consumer", "deceptive", "unfair", "harm", "safety", "abuse"),
    "civil_rights_nondiscrimination": ("discrimination", "rights", "civil rights", "fairness", "equal opportunity"),
    "industrial_innovation": ("innovation", "industry", "competitiveness", "industrial", "business"),
    "education": ("education", "school", "university", "teaching"),
    "platform_content_governance": ("content", "label", "platform", "recommendation", "synthesis", "deep synthesis"),
    "critical_infrastructure": ("critical infrastructure", "infrastructure", "grid"),
    "frontier_gpai": ("general-purpose", "gpai", "foundation model", "frontier", "model", "generative ai", "generative", "ai"),
}

TAG_TO_DOMAIN = {
    "finance": "finance",
    "consumer_protection": "consumer_protection",
    "healthcare": "healthcare_medical_devices",
    "medical_devices": "healthcare_medical_devices",
    "privacy": "privacy_data_protection",
    "copyright": "copyright_ip",
    "public_sector": "public_sector_governance",
    "procurement": "public_sector_procurement",
    "standards": "standards_assurance",
    "gpai": "frontier_gpai",
}

SOURCE_ROLE_BUCKET_MAP = {
    "primary_text": "implementation_guidance",
    "wrapper_page": "implementation_guidance",
    "faq": "enforcement_interpretation",
    "consultation_draft": "consultation_draft",
    "implementation_tool": "implementation_guidance",
    "press_release": "implementation_guidance",
    "download_index": "implementation_guidance",
    "navigation_hub": "strategy_architecture",
    "translation_variant": "implementation_guidance",
    "supporting_context": "implementation_guidance",
}

SOURCE_ROLE_SCORE = {
    "primary_text": 4,
    "wrapper_page": 2,
    "faq": 2,
    "consultation_draft": 2,
    "implementation_tool": 0,
    "press_release": -2,
    "download_index": 1,
    "navigation_hub": -4,
    "translation_variant": -1,
    "supporting_context": -2,
}
FAMILY_SIGNATURE_STOPWORDS = {"a", "an", "and", "for", "in", "of", "on", "the", "to"}

FAMILY_ROLE_STRIP_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bdownload\b",
        r"\bpdf\b",
        r"\bfaq\b",
        r"\bq\s*&\s*a\b",
        r"\bquestions?\s+(?:&|and)\s+answers?\b",
        r"\bpress release\b",
        r"\bnews\b",
        r"\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b",
        r"\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b",
        r"\benglish\b",
        r"\bfrench\b",
        r"\bgerman\b",
        r"\bspanish\b",
        r"\bitalian\b",
        r"\bdutch\b",
        r"\bportuguese\b",
        r"\bromanian\b",
        r"\bbulgarian\b",
        r"\bcroatian\b",
        r"\bczech\b",
        r"\bdanish\b",
        r"\bestonian\b",
        r"\bfinnish\b",
        r"\bgreek\b",
        r"\bhungarian\b",
        r"\blatvian\b",
        r"\blithuanian\b",
        r"\bmaltese\b",
        r"\bpolish\b",
        r"\bslovak\b",
        r"\bslovene\b",
        r"\bthe commission publishes\b",
        r"\bcommission publishes\b",
        r"\bhow the ai office is supporting\b",
    )
]


def normalize_url(url: str) -> str:
    split_url = urlsplit(url)
    normalized_path = split_url.path.split(";", 1)[0].rstrip("/") or "/"
    return urlunsplit((split_url.scheme, split_url.netloc, normalized_path, split_url.query, ""))


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip().casefold()


def candidate_text(candidate: dict[str, Any]) -> str:
    return " ".join(
        part
        for part in (
            normalize_text(candidate.get("title")),
            normalize_text(candidate.get("url")),
        )
        if part
    )


def _matches_any_keyword(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword.casefold() in text for keyword in keywords)


def infer_source_role(candidate: dict[str, Any]) -> str:
    text = candidate_text(candidate)
    normalized_url = normalize_url(candidate["url"]).casefold()
    if _matches_any_keyword(text, STRUCTURAL_LOW_SIGNAL_KEYWORDS):
        return "navigation_hub"
    if _matches_any_keyword(text, DOWNLOAD_INDEX_KEYWORDS):
        return "download_index"
    if ".pdf" in normalized_url and _matches_any_keyword(text, PRIMARY_INSTRUMENT_KEYWORDS):
        return "primary_text"
    if _matches_any_keyword(text, CONSULTATION_KEYWORDS):
        return "consultation_draft"
    if _matches_any_keyword(text, FAQ_KEYWORDS):
        return "faq"
    if _matches_any_keyword(text, PRESS_RELEASE_KEYWORDS):
        return "press_release"
    if _matches_any_keyword(text, TOOL_KEYWORDS):
        return "implementation_tool"
    if "/library/" in normalized_url and ".pdf" not in normalized_url:
        return "wrapper_page"
    if any(marker in text for marker in LANGUAGE_MARKERS) and ".pdf" in normalized_url:
        return "translation_variant"
    if _matches_any_keyword(text, HUB_KEYWORDS):
        return "navigation_hub"
    if ".pdf" in normalized_url or _matches_any_keyword(text, PRIMARY_INSTRUMENT_KEYWORDS):
        return "primary_text"
    return "supporting_context"


def extract_instrument_identifier(candidate: dict[str, Any]) -> str | None:
    text = candidate_text(candidate)
    patterns = (
        r"\b(?:regulation|directive|decision)\s*(?:\([a-z]+\)\s*)?(\d{4}[/-]\d{2,5})\b",
        r"\bcelex[:\s]*([0-9a-z]+)\b",
        r"\b(?:executive order|eo)\s*([0-9]{4,6})\b",
        r"\b([a-z]-\d{1,4}-\d{1,4})\b",
        r"\bc\((\d{4})\)\s*([0-9]{2,6})\b",
        r"\b(regulation\s*\(eu\)\s*2024/1689)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue
        groups = [group for group in match.groups() if group]
        if groups:
            return "-".join(groups).casefold()
        return match.group(0).casefold()
    return None


def family_label(candidate: dict[str, Any]) -> str:
    title = candidate.get("title") or Path(urlsplit(candidate["url"]).path).name or candidate["url"]
    normalized = normalize_text(title)
    for pattern in FAMILY_ROLE_STRIP_PATTERNS:
        normalized = pattern.sub(" ", normalized)
    normalized = re.sub(r"\([^)]*\)", " ", normalized)
    normalized = re.sub(r"[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if len(normalized.split()) > 12:
        normalized = " ".join(normalized.split()[:12])
    return normalized or normalize_url(candidate["url"])


def family_signature(label: str) -> str:
    tokens = [
        token
        for token in normalize_text(label).split()
        if token not in FAMILY_SIGNATURE_STOPWORDS and not token.isdigit()
    ]
    return " ".join(sorted(tokens))


def _signature_tokens(value: str) -> set[str]:
    return {token for token in normalize_text(value).split() if token}


def family_signature_matches(candidate_label: str, existing_signatures: set[str]) -> bool:
    candidate_signature = family_signature(candidate_label)
    if candidate_signature in existing_signatures:
        return True

    candidate_tokens = _signature_tokens(candidate_signature)
    if len(candidate_tokens) < 4:
        return False

    for existing_signature in existing_signatures:
        existing_tokens = _signature_tokens(existing_signature)
        smaller = min(len(candidate_tokens), len(existing_tokens))
        if smaller < 4:
            continue
        shared = candidate_tokens & existing_tokens
        if len(shared) >= smaller - 1 and (len(shared) / smaller) >= 0.8:
            return True
    return False


def family_id(candidate: dict[str, Any]) -> str:
    identifier = extract_instrument_identifier(candidate)
    if identifier:
        return f"instrument:{identifier}"
    label = family_label(candidate)
    return f"title:{label}"


def score_candidate(candidate: dict[str, Any], source_role: str) -> tuple[int, list[str]]:
    text = candidate_text(candidate)
    normalized_url = normalize_url(candidate["url"]).casefold()
    score = 0
    reasons: list[str] = []

    if _matches_any_keyword(text, AI_RELEVANCE_KEYWORDS):
        score += 4
        reasons.append("AI-relevant title or URL")
    else:
        score -= 5
        reasons.append("weak AI relevance signal")

    if _matches_any_keyword(text, PRIMARY_INSTRUMENT_KEYWORDS):
        score += 4
        reasons.append("instrument-like title")

    role_score = SOURCE_ROLE_SCORE[source_role]
    score += role_score
    if role_score > 0:
        reasons.append(f"{source_role} role")
    elif role_score < 0:
        reasons.append(f"{source_role} role penalty")

    if ".pdf" in normalized_url:
        score += 2
        reasons.append("direct PDF artifact")

    if "press release" in text:
        score -= 2
        reasons.append("press release demotion")

    if _matches_any_keyword(text, LOW_SIGNAL_KEYWORDS):
        score -= 3
        reasons.append("low-signal event/news language")

    return score, reasons


def recommendation_for_candidate(*, score: int, source_role: str, status: str) -> str:
    if status == "existing_seed":
        return "already_seeded"
    if source_role == "implementation_tool":
        return "context_only"
    if source_role == "download_index":
        return "context_only"
    if source_role == "navigation_hub" and score < 7:
        return "context_only"
    if source_role == "press_release" and score < 7:
        return "monitor_only"
    if score >= 8:
        return "promote_now"
    if score >= 5:
        return "inspect_next"
    return "monitor_only"


def classify_candidate(candidate: dict[str, Any], portal_tags: list[str], source_role: str) -> tuple[str, str, str]:
    text = candidate_text(candidate)
    if "executive order" in text:
        return ("executive_order", "executive_action", "executive_action")
    if "pact" in text or "commitment" in text:
        return ("voluntary_commitment", "voluntary_commitment", "voluntary_framework")
    if source_role == "consultation_draft":
        return ("regulatory_guidance", "regulatory_guidance", "consultation_draft")
    if any(keyword in text for keyword in ("standard", "standards", "framework", "playbook", "profile", "code of practice", "template", "ガイドライン", "标准", "표준")):
        return ("standards_guideline", "standards_guideline", "technical_standard")
    if source_role in {"faq", "implementation_tool"} or any(keyword in text for keyword in ("overview", "implementation", "enforcement", "service desk", "timeline", "whistleblower")):
        return ("regulatory_guidance", "regulatory_guidance", "implementation_resource")
    if any(keyword in text for keyword in ("guidance", "guideline", "circular", "opinion", "checklist", "指南", "지침", "가이드라인", "意見")):
        return ("regulatory_guidance", "regulatory_guidance", "regulatory_guidance")
    if any(keyword in text for keyword in ("act", "law", "regulation", "decree", "measures", "provisions", "办法", "措施", "规定", "법", "법률", "시행령")):
        return ("legislation", "binding_law", "statutory_rule")
    if "standards" in portal_tags:
        return ("standards_guideline", "standards_guideline", "technical_standard")
    return ("strategy_paper", "strategy_statement", "policy_strategy")


def infer_policy_domains(candidate: dict[str, Any], portal_tags: list[str]) -> list[str]:
    text = candidate_text(candidate)
    domains: list[str] = []
    for domain, keywords in POLICY_DOMAIN_HINTS.items():
        if any(keyword.casefold() in text for keyword in keywords):
            domains.append(domain)
    for tag in portal_tags:
        domain = TAG_TO_DOMAIN.get(tag)
        if domain is not None and domain not in domains:
            domains.append(domain)
    if "frontier_gpai" not in domains and _matches_any_keyword(text, AI_RELEVANCE_KEYWORDS):
        domains.append("frontier_gpai")
    return domains[:5]


def existing_document_indexes(seed_documents: list[dict[str, Any]]) -> tuple[set[str], set[str], set[str]]:
    existing_urls: set[str] = set()
    existing_titles = {normalize_text(document["title"]) for document in seed_documents}
    existing_family_labels: set[str] = set()
    for document in seed_documents:
        existing_urls.add(normalize_url(document["canonical_url"]))
        for retrieval_url in document.get("retrieval_urls", []):
            existing_urls.add(normalize_url(retrieval_url))
        existing_family_labels.add(
            family_signature(family_label({"title": document["title"], "url": document["canonical_url"]}))
        )
        relevance_notes = document.get("relevance_notes")
        if isinstance(relevance_notes, str):
            match = re.search(r"(?:^|;\s*)family=(.+?)(?:;|$)", relevance_notes)
            if match:
                existing_family_labels.add(family_signature(match.group(1)))
    return existing_urls, existing_titles, existing_family_labels


def candidate_status(
    candidate: dict[str, Any],
    existing_urls: set[str],
    existing_titles: set[str],
    existing_family_labels: set[str],
) -> str:
    if normalize_url(candidate["url"]) in existing_urls:
        return "existing_seed"
    title = candidate.get("title")
    if title and normalize_text(title) in existing_titles:
        return "existing_seed"
    if family_signature_matches(family_label(candidate), existing_family_labels):
        return "existing_seed"
    return "new_candidate"


def evaluate_candidate(
    *,
    candidate: dict[str, Any],
    portal: SourcePortal,
    existing_urls: set[str],
    existing_titles: set[str],
    existing_family_labels: set[str],
) -> dict[str, Any]:
    status = candidate_status(candidate, existing_urls, existing_titles, existing_family_labels)
    role = infer_source_role(candidate)
    score, reasons = score_candidate(candidate, role)
    document_type, binding_strength, source_tier = classify_candidate(candidate, portal.tags, role)
    policy_domains = infer_policy_domains(candidate, portal.tags)
    coverage_bucket = SOURCE_ROLE_BUCKET_MAP.get(role, "implementation_guidance")
    return {
        "title": candidate.get("title"),
        "url": candidate["url"],
        "status": status,
        "source_role": role,
        "family_id": family_id(candidate),
        "family_label": family_label(candidate),
        "score": score,
        "recommendation": recommendation_for_candidate(score=score, source_role=role, status=status),
        "proposed_document_type": document_type,
        "proposed_binding_strength": binding_strength,
        "proposed_source_tier": source_tier,
        "proposed_policy_domains": policy_domains,
        "coverage_bucket": coverage_bucket,
        "last_modified": candidate.get("last_modified"),
        "discovered_from": candidate.get("discovered_from"),
        "score_reasons": reasons,
    }


def group_candidate_families(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        grouped.setdefault(candidate["family_id"], []).append(candidate)

    families: list[dict[str, Any]] = []
    recommendation_order = {
        "promote_now": 0,
        "inspect_next": 1,
        "monitor_only": 2,
        "context_only": 3,
        "already_seeded": 4,
    }

    for key, members in grouped.items():
        members.sort(key=lambda item: (-item["score"], item["title"] or item["url"]))
        best = members[0]
        new_members = [item for item in members if item["status"] == "new_candidate"]
        role_counts: dict[str, int] = {}
        for item in members:
            role_counts[item["source_role"]] = role_counts.get(item["source_role"], 0) + 1
        families.append(
            {
                "family_id": key,
                "family_label": best["family_label"],
                "status": "new_family" if new_members else "existing_seed_family",
                "member_count": len(members),
                "new_candidate_count": len(new_members),
                "source_role_counts": dict(sorted(role_counts.items())),
                "best_candidate_score": best["score"],
                "best_recommendation": best["recommendation"],
                "best_source_role": best["source_role"],
                "proposed_document_type": best["proposed_document_type"],
                "proposed_binding_strength": best["proposed_binding_strength"],
                "proposed_source_tier": best["proposed_source_tier"],
                "proposed_policy_domains": best["proposed_policy_domains"],
                "coverage_bucket": best["coverage_bucket"],
                "representative_title": best["title"],
                "representative_url": best["url"],
                "members": members,
            }
        )

    families.sort(
        key=lambda item: (
            recommendation_order[item["best_recommendation"]],
            -item["best_candidate_score"],
            item["family_label"],
        )
    )
    return families


def seed_document_coverage_buckets(document: dict[str, Any]) -> list[str]:
    buckets: set[str] = set()
    tier = document.get("source_tier")
    if tier == "statutory_rule":
        buckets.add("statutory_rule")
    elif tier == "policy_strategy":
        buckets.add("strategy_architecture")
    elif tier == "technical_standard":
        buckets.add("technical_standard")
    elif tier == "voluntary_framework":
        buckets.add("voluntary_framework")
    elif tier == "implementation_resource":
        buckets.add("implementation_guidance")
    elif tier == "regulatory_guidance":
        buckets.add("implementation_guidance")

    text = normalize_text(document.get("title"))
    if _matches_any_keyword(text, FAQ_KEYWORDS) or any(keyword in text for keyword in ("opinion", "enforcement", "监督", "監督")):
        buckets.add("enforcement_interpretation")
    if document.get("lifecycle_stage") == "draft":
        buckets.add("consultation_draft")
    if any(domain in (document.get("policy_domains") or []) for domain in ("healthcare_medical_devices", "finance", "education", "public_sector_governance", "public_sector_procurement", "copyright_ip", "privacy_data_protection", "critical_infrastructure")):
        buckets.add("sectoral_guidance")
    return sorted(buckets or {"implementation_guidance"})


def expected_coverage_buckets(portal: SourcePortal) -> list[str]:
    buckets: set[str] = set()
    if portal.issuer_type == "legal_registry":
        buckets.add("statutory_rule")
    if portal.issuer_type == "standards_body" or "standards" in portal.tags:
        buckets.add("technical_standard")
    if portal.portal_kind == "helpdesk":
        buckets.add("implementation_guidance")
    if portal.issuer_type in {"regulator", "multi_agency"}:
        buckets.update({"implementation_guidance", "enforcement_interpretation"})
    if portal.issuer_type == "executive":
        buckets.add("strategy_architecture")
        buckets.add("implementation_guidance")
    if any(tag in portal.tags for tag in ("healthcare", "medical_devices", "privacy", "copyright", "finance", "public_sector", "procurement")):
        buckets.add("sectoral_guidance")
    if any(tag in portal.tags for tag in ("voluntary", "commitment")):
        buckets.add("voluntary_framework")
    if any(tag in portal.tags for tag in ("draft", "consultation")):
        buckets.add("consultation_draft")
    return sorted(buckets)


def suggest_portal_action(
    *,
    missing_buckets: list[str],
    high_signal_family_count: int,
    candidate_count: int,
) -> str:
    if high_signal_family_count >= 5 or (missing_buckets and high_signal_family_count >= 2):
        return "expand_seed_documents"
    if high_signal_family_count > 0:
        return "inspect_families"
    if candidate_count >= 10:
        return "retune_discovery_filters"
    return "monitor_only"


def _load_discovery_payload(jurisdiction: str, portal_id: str) -> dict[str, Any] | None:
    path = DISCOVERY_DIR / jurisdiction / f"{portal_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def build_source_operations_model() -> dict[str, Any]:
    inventory = build_source_inventory()
    manifests = {manifest.jurisdiction: manifest for manifest in load_all_source_manifests()}
    generated_at = datetime.now(timezone.utc).isoformat()

    jurisdictions: list[dict[str, Any]] = []
    global_priority_families: list[dict[str, Any]] = []

    for jurisdiction_inventory in inventory["jurisdictions"]:
        manifest = manifests[jurisdiction_inventory["jurisdiction"]]
        portal_by_id = {portal.id: portal for portal in manifest.source_portals}
        existing_urls, existing_titles, existing_family_labels = existing_document_indexes(
            [document.model_dump(mode="json") for document in manifest.seed_documents]
        )

        portal_operations: list[dict[str, Any]] = []
        jurisdiction_priority_families: list[dict[str, Any]] = []

        for portal_inventory in jurisdiction_inventory["source_portals"]:
            portal = portal_by_id[portal_inventory["id"]]
            discovery_payload = _load_discovery_payload(jurisdiction_inventory["jurisdiction"], portal.id)
            candidates_payload = (discovery_payload or {}).get("candidates", [])
            evaluated_candidates = [
                evaluate_candidate(
                    candidate=candidate,
                    portal=portal,
                    existing_urls=existing_urls,
                    existing_titles=existing_titles,
                    existing_family_labels=existing_family_labels,
                )
                for candidate in candidates_payload
            ]
            families = group_candidate_families(evaluated_candidates)

            existing_seeds = [
                document
                for document in jurisdiction_inventory["seed_documents"]
                if portal.id in document["source_portal_ids"]
            ]
            covered_bucket_counts: dict[str, int] = {}
            for document in existing_seeds:
                for bucket in seed_document_coverage_buckets(document):
                    covered_bucket_counts[bucket] = covered_bucket_counts.get(bucket, 0) + 1

            candidate_bucket_counts: dict[str, int] = {}
            for family in families:
                if family["status"] != "new_family":
                    continue
                bucket = family["coverage_bucket"]
                candidate_bucket_counts[bucket] = candidate_bucket_counts.get(bucket, 0) + 1

            expected_buckets = expected_coverage_buckets(portal)
            covered_buckets = sorted(covered_bucket_counts)
            missing_buckets = sorted(bucket for bucket in expected_buckets if bucket not in covered_buckets)
            high_signal_families = [
                family
                for family in families
                if family["status"] == "new_family"
                and family["best_recommendation"] in {"promote_now", "inspect_next"}
            ]
            suggested_action = suggest_portal_action(
                missing_buckets=missing_buckets,
                high_signal_family_count=len(high_signal_families),
                candidate_count=len(evaluated_candidates),
            )

            portal_operations.append(
                {
                    "portal_id": portal.id,
                    "portal_name": portal.name,
                    "issuer_type": portal.issuer_type,
                    "portal_kind": portal.portal_kind,
                    "tags": portal.tags,
                    "existing_seed_count": len(existing_seeds),
                    "candidate_count": len(evaluated_candidates),
                    "family_count": len(families),
                    "high_signal_family_count": len(high_signal_families),
                    "expected_coverage_buckets": expected_buckets,
                    "covered_coverage_buckets": covered_buckets,
                    "missing_coverage_buckets": missing_buckets,
                    "covered_bucket_counts": dict(sorted(covered_bucket_counts.items())),
                    "candidate_bucket_counts": dict(sorted(candidate_bucket_counts.items())),
                    "suggested_action": suggested_action,
                    "priority_families": high_signal_families[:8],
                }
            )
            jurisdiction_priority_families.extend(
                {
                    "jurisdiction": jurisdiction_inventory["jurisdiction"],
                    "portal_id": portal.id,
                    "portal_name": portal.name,
                    **family,
                }
                for family in high_signal_families
            )

        jurisdiction_priority_families.sort(
            key=lambda item: (
                {"promote_now": 0, "inspect_next": 1, "monitor_only": 2, "context_only": 3, "already_seeded": 4}[item["best_recommendation"]],
                -item["best_candidate_score"],
                item["family_label"],
            )
        )
        portal_operations.sort(
            key=lambda item: (
                {"expand_seed_documents": 0, "inspect_families": 1, "retune_discovery_filters": 2, "monitor_only": 3}[item["suggested_action"]],
                -item["high_signal_family_count"],
                -item["candidate_count"],
            )
        )
        target_range = JURISDICTION_TARGET_RANGES[jurisdiction_inventory["jurisdiction"]]
        jurisdictions.append(
            {
                "jurisdiction": jurisdiction_inventory["jurisdiction"],
                "description": jurisdiction_inventory["description"],
                "coverage_snapshot": {
                    "portal_count": jurisdiction_inventory["portal_count"],
                    "seed_document_count": jurisdiction_inventory["seed_document_count"],
                    "target_range": target_range,
                    "gap_to_minimum": max(0, target_range["minimum"] - jurisdiction_inventory["seed_document_count"]),
                    "document_type_counts": jurisdiction_inventory["document_type_counts"],
                    "source_tier_counts": jurisdiction_inventory["source_tier_counts"],
                    "policy_domain_counts": jurisdiction_inventory["policy_domain_counts"],
                },
                "portal_operations": portal_operations,
                "priority_families": jurisdiction_priority_families[:12],
            }
        )
        global_priority_families.extend(jurisdiction_priority_families)

    global_priority_families.sort(
        key=lambda item: (
            {"promote_now": 0, "inspect_next": 1, "monitor_only": 2, "context_only": 3, "already_seeded": 4}[item["best_recommendation"]],
            -item["best_candidate_score"],
            item["jurisdiction"],
            item["family_label"],
        )
    )

    return {
        "generated_at": generated_at,
        "jurisdictions": jurisdictions,
        "global_priority_families": global_priority_families[:25],
    }
