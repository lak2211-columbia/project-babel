from __future__ import annotations

import json
from pathlib import Path
from typing import Literal, Sequence

from pydantic import AnyHttpUrl, BaseModel, Field, field_validator, model_validator

from observatory.taxonomy import load_taxonomy


ROOT = Path(__file__).resolve().parents[4]
SOURCES_DIR = ROOT / "data" / "sources"

SourcePriority = Literal["high", "medium", "low"]
RetrievalStrategy = Literal["html", "pdf", "mixed", "manual", "browser"]
PortalKind = Literal["portal", "library", "helpdesk", "registry"]
DocumentFormat = Literal["html", "pdf", "mixed"]
DiscoveryKind = Literal["html_links", "sitemap"]


class DiscoveryTarget(BaseModel):
    url: AnyHttpUrl
    kind: DiscoveryKind
    link_selector: str | None = None
    include_url_patterns: list[str] = Field(default_factory=list)
    exclude_url_patterns: list[str] = Field(default_factory=list)
    include_title_patterns: list[str] = Field(default_factory=list)
    exclude_title_patterns: list[str] = Field(default_factory=list)
    same_host_only: bool = True
    browser_required: bool = False
    browser_wait_for_selector: str | None = None
    browser_min_text_length: int | None = None
    browser_click_selectors: list[str] = Field(default_factory=list)
    max_candidates: int | None = None

    @field_validator("link_selector")
    @classmethod
    def validate_link_selector(cls, value: str | None) -> str | None:
        if value is None:
            return None
        selector = value.strip()
        if not selector:
            raise ValueError("link_selector must not be empty")
        return selector

    @field_validator(
        "include_url_patterns",
        "exclude_url_patterns",
        "include_title_patterns",
        "exclude_title_patterns",
    )
    @classmethod
    def validate_patterns(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for pattern in value:
            normalized = pattern.strip()
            if not normalized:
                raise ValueError("discovery patterns must not be empty")
            if normalized in seen:
                continue
            seen.add(normalized)
            cleaned.append(normalized)
        return cleaned

    @field_validator("browser_wait_for_selector")
    @classmethod
    def validate_browser_wait_for_selector(cls, value: str | None) -> str | None:
        if value is None:
            return None
        selector = value.strip()
        if not selector:
            raise ValueError("browser_wait_for_selector must not be empty")
        return selector

    @field_validator("browser_min_text_length")
    @classmethod
    def validate_browser_min_text_length(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value < 1:
            raise ValueError("browser_min_text_length must be positive")
        return value

    @field_validator("browser_click_selectors")
    @classmethod
    def validate_browser_click_selectors(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for selector in value:
            normalized = selector.strip()
            if not normalized:
                raise ValueError("browser_click_selectors entries must not be empty")
            if normalized in seen:
                continue
            seen.add(normalized)
            cleaned.append(normalized)
        return cleaned

    @field_validator("max_candidates")
    @classmethod
    def validate_max_candidates(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value < 1:
            raise ValueError("max_candidates must be positive")
        return value

    @model_validator(mode="after")
    def validate_target(self) -> "DiscoveryTarget":
        if self.kind == "html_links" and self.link_selector is None:
            raise ValueError("html_links discovery targets must define link_selector")
        return self


class SourcePortal(BaseModel):
    id: str
    name: str
    issuing_body: str
    issuer_type: str | None = None
    canonical_url: AnyHttpUrl
    portal_kind: PortalKind
    retrieval_strategy: RetrievalStrategy
    languages: list[str] = Field(min_length=1)
    priority: SourcePriority
    coverage_notes: str
    tags: list[str] = Field(default_factory=list)
    discovery_targets: list[DiscoveryTarget] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        if not value:
            raise ValueError("portal id must not be empty")
        allowed = set("abcdefghijklmnopqrstuvwxyz0123456789_-")
        if any(char not in allowed for char in value):
            raise ValueError("portal id must use lowercase letters, numbers, underscores, or dashes")
        return value


class SeedDocument(BaseModel):
    id: str
    title: str
    issuing_body: str
    canonical_url: AnyHttpUrl
    retrieval_urls: list[AnyHttpUrl] = Field(default_factory=list)
    browser_required: bool = False
    browser_wait_for_selector: str | None = None
    browser_min_text_length: int | None = None
    browser_click_selectors: list[str] = Field(default_factory=list)
    document_type: str
    binding_strength: str
    source_tier: str | None = None
    policy_domains: list[str] = Field(default_factory=list)
    lifecycle_stage: str | None = None
    publication_date: str | None = None
    effective_date: str | None = None
    languages: list[str] = Field(min_length=1)
    document_format: DocumentFormat
    source_portal_ids: list[str] = Field(min_length=1)
    priority: SourcePriority
    relevance_notes: str
    tags: list[str] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        if not value:
            raise ValueError("document id must not be empty")
        allowed = set("abcdefghijklmnopqrstuvwxyz0123456789_-")
        if any(char not in allowed for char in value):
            raise ValueError("document id must use lowercase letters, numbers, underscores, or dashes")
        return value

    @field_validator("publication_date", "effective_date")
    @classmethod
    def validate_date_string(cls, value: str | None) -> str | None:
        if value is None:
            return value
        parts = value.split("-")
        if len(parts) != 3 or any(not part.isdigit() for part in parts):
            raise ValueError("dates must be ISO formatted as YYYY-MM-DD")
        return value

    @field_validator("retrieval_urls")
    @classmethod
    def validate_retrieval_urls(cls, value: list[AnyHttpUrl]) -> list[AnyHttpUrl]:
        seen: set[str] = set()
        unique_urls: list[AnyHttpUrl] = []
        for url in value:
            url_str = str(url)
            if url_str in seen:
                continue
            seen.add(url_str)
            unique_urls.append(url)
        return unique_urls

    @field_validator("policy_domains")
    @classmethod
    def validate_policy_domains(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value:
            normalized = item.strip()
            if not normalized:
                raise ValueError("policy domains must not be empty")
            if normalized in seen:
                continue
            seen.add(normalized)
            cleaned.append(normalized)
        return cleaned

    @field_validator("browser_wait_for_selector")
    @classmethod
    def validate_browser_wait_for_selector(cls, value: str | None) -> str | None:
        if value is None:
            return None
        selector = value.strip()
        if not selector:
            raise ValueError("browser_wait_for_selector must not be empty")
        return selector

    @field_validator("browser_min_text_length")
    @classmethod
    def validate_browser_min_text_length(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value < 1:
            raise ValueError("browser_min_text_length must be positive")
        return value

    @field_validator("browser_click_selectors")
    @classmethod
    def validate_browser_click_selectors(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for selector in value:
            normalized = selector.strip()
            if not normalized:
                raise ValueError("browser_click_selectors entries must not be empty")
            if normalized in seen:
                continue
            seen.add(normalized)
            cleaned.append(normalized)
        return cleaned


class JurisdictionManifest(BaseModel):
    manifest_version: str
    jurisdiction: str
    description: str
    source_portals: list[SourcePortal] = Field(min_length=1)
    seed_documents: list[SeedDocument] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_references(self) -> "JurisdictionManifest":
        portal_ids = [portal.id for portal in self.source_portals]
        if len(portal_ids) != len(set(portal_ids)):
            raise ValueError("portal ids must be unique within a manifest")

        document_ids = [document.id for document in self.seed_documents]
        if len(document_ids) != len(set(document_ids)):
            raise ValueError("document ids must be unique within a manifest")

        portal_id_set = set(portal_ids)
        for document in self.seed_documents:
            missing = sorted(set(document.source_portal_ids) - portal_id_set)
            if missing:
                missing_list = ", ".join(missing)
                raise ValueError(
                    f"document '{document.id}' references missing portal ids: {missing_list}"
                )

        return self


def _manifest_paths(sources_dir: Path = SOURCES_DIR) -> list[Path]:
    return sorted(path for path in sources_dir.glob("*.json") if path.is_file())


def load_source_manifest(path: Path) -> JurisdictionManifest:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    manifest = JurisdictionManifest.model_validate(payload)

    taxonomy = load_taxonomy()
    if manifest.jurisdiction not in taxonomy["jurisdictions"]:
        raise ValueError(f"manifest '{path.name}' uses unknown jurisdiction '{manifest.jurisdiction}'")

    allowed_document_types = set(taxonomy["document_types"])
    allowed_binding_strength = set(taxonomy["binding_strength"])
    allowed_issuer_types = set(taxonomy["issuer_types"])
    allowed_source_tiers = set(taxonomy["source_tiers"])
    allowed_policy_domains = set(taxonomy["policy_domains"])
    allowed_lifecycle_stages = set(taxonomy["lifecycle_stages"])
    for portal in manifest.source_portals:
        if portal.issuer_type is not None and portal.issuer_type not in allowed_issuer_types:
            raise ValueError(
                f"manifest '{path.name}' uses unknown issuer type '{portal.issuer_type}'"
            )
    for document in manifest.seed_documents:
        if document.document_type not in allowed_document_types:
            raise ValueError(
                f"manifest '{path.name}' uses unknown document type '{document.document_type}'"
            )
        if document.binding_strength not in allowed_binding_strength:
            raise ValueError(
                f"manifest '{path.name}' uses unknown binding strength '{document.binding_strength}'"
            )
        if document.source_tier is not None and document.source_tier not in allowed_source_tiers:
            raise ValueError(
                f"manifest '{path.name}' uses unknown source tier '{document.source_tier}'"
            )
        if document.lifecycle_stage is not None and document.lifecycle_stage not in allowed_lifecycle_stages:
            raise ValueError(
                f"manifest '{path.name}' uses unknown lifecycle stage '{document.lifecycle_stage}'"
            )
        unknown_policy_domains = sorted(set(document.policy_domains) - allowed_policy_domains)
        if unknown_policy_domains:
            missing_items = ", ".join(unknown_policy_domains)
            raise ValueError(
                f"manifest '{path.name}' uses unknown policy domains: {missing_items}"
            )

    expected_name = f"{manifest.jurisdiction}.json"
    if path.name != expected_name:
        raise ValueError(f"manifest filename '{path.name}' must match jurisdiction '{expected_name}'")

    return manifest


def load_all_source_manifests(sources_dir: Path = SOURCES_DIR) -> list[JurisdictionManifest]:
    manifests = [load_source_manifest(path) for path in _manifest_paths(sources_dir)]
    if not manifests:
        raise ValueError("no source manifests found")

    jurisdictions = [manifest.jurisdiction for manifest in manifests]
    if len(jurisdictions) != len(set(jurisdictions)):
        raise ValueError("jurisdictions must be unique across manifests")

    return manifests


def summarize_source_manifests(
    manifests: Sequence[JurisdictionManifest],
) -> list[tuple[str, int, int]]:
    return [
        (manifest.jurisdiction, len(manifest.source_portals), len(manifest.seed_documents))
        for manifest in manifests
    ]


def validate_source_manifests() -> None:
    load_all_source_manifests()


def source_manifest_path(jurisdiction: str, sources_dir: Path = SOURCES_DIR) -> Path:
    return sources_dir / f"{jurisdiction}.json"


def write_source_manifest(
    manifest: JurisdictionManifest,
    *,
    path: Path | None = None,
    sources_dir: Path = SOURCES_DIR,
) -> Path:
    target_path = path or source_manifest_path(manifest.jurisdiction, sources_dir=sources_dir)
    payload = manifest.model_dump(mode="json", exclude_none=True, exclude_defaults=True)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return target_path
