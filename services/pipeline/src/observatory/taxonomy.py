from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path(__file__).resolve().parents[4]
TAXONOMY_PATH = ROOT / "data" / "taxonomies" / "observatory-taxonomy.json"
LABEL_DEFINITIONS_PATH = ROOT / "data" / "taxonomies" / "label-definitions.json"

METADATA_KEYS = {
    "taxonomy_version",
    "schema_version",
    "updated_at",
    "versioning_policy",
}

REQUIRED_KEYS = {
    "jurisdictions",
    "document_types",
    "binding_strength",
    "issuer_types",
    "source_tiers",
    "policy_domains",
    "lifecycle_stages",
    "policy_requirements",
    "obligation_strengths",
    "enforcement_mechanisms",
    "application_domains",
    "risk_framings",
}

DEFAULT_CANONICAL_THRESHOLDS: Dict[str, float] = {
    "grounding_pass_threshold": 0.90,
    "low_confidence_policy": 0.70,
    "low_confidence_framing": 0.60,
    "frame_mention_floor": 0.15,
}


def load_taxonomy_document(path: Path = TAXONOMY_PATH) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, dict):
        raise ValueError("taxonomy payload must be a JSON object")

    missing = REQUIRED_KEYS.difference(payload)
    if missing:
        missing_items = ", ".join(sorted(missing))
        raise ValueError(f"taxonomy missing required keys: {missing_items}")

    for key, values in payload.items():
        if key in METADATA_KEYS:
            if not isinstance(values, str) or not values.strip():
                raise ValueError(f"taxonomy metadata '{key}' must be a non-empty string")
            continue
        if not isinstance(values, list) or not values:
            raise ValueError(f"taxonomy category '{key}' must be a non-empty list")
        if any(not isinstance(item, str) or not item.strip() for item in values):
            raise ValueError(f"taxonomy category '{key}' must contain non-empty strings")
        duplicates = {value for value in values if values.count(value) > 1}
        if duplicates:
            duplicate_items = ", ".join(sorted(duplicates))
            raise ValueError(f"taxonomy category '{key}' has duplicates: {duplicate_items}")

    return payload


def load_taxonomy(path: Path = TAXONOMY_PATH) -> Dict[str, List[str]]:
    payload = load_taxonomy_document(path)
    return {
        key: list(values)
        for key, values in payload.items()
        if key not in METADATA_KEYS
    }


def load_taxonomy_metadata(path: Path = TAXONOMY_PATH) -> Dict[str, str]:
    payload = load_taxonomy_document(path)
    return {
        key: str(value)
        for key, value in payload.items()
        if key in METADATA_KEYS
    }


def get_taxonomy_version(path: Path = TAXONOMY_PATH) -> str:
    metadata = load_taxonomy_metadata(path)
    return metadata.get("taxonomy_version", "1.0.0")


def load_label_definitions(path: Path = LABEL_DEFINITIONS_PATH) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("label definitions payload must be a JSON object")
    categories = payload.get("categories")
    if not isinstance(categories, dict) or not categories:
        raise ValueError("label definitions missing non-empty 'categories' object")
    thresholds = payload.get("thresholds")
    if not isinstance(thresholds, dict):
        raise ValueError("label definitions missing 'thresholds' object")
    return payload


def get_canonical_thresholds(path: Path = LABEL_DEFINITIONS_PATH) -> Dict[str, float]:
    if not path.exists():
        return dict(DEFAULT_CANONICAL_THRESHOLDS)
    payload = load_label_definitions(path)
    raw_thresholds = payload.get("thresholds", {})
    resolved = dict(DEFAULT_CANONICAL_THRESHOLDS)
    for key, default_value in DEFAULT_CANONICAL_THRESHOLDS.items():
        raw_val = raw_thresholds.get(key)
        if isinstance(raw_val, (int, float)) and raw_val == raw_val:
            resolved[key] = float(raw_val)
        else:
            resolved[key] = default_value
    return resolved


def validate_label_definitions(
    taxonomy_path: Path = TAXONOMY_PATH,
    definitions_path: Path = LABEL_DEFINITIONS_PATH,
) -> None:
    taxonomy = load_taxonomy(taxonomy_path)
    definitions = load_label_definitions(definitions_path)
    categories = definitions["categories"]

    required_entry_fields = {"label", "short_label", "definition", "include_when", "exclude_when"}
    for category, entries in categories.items():
        if category not in taxonomy:
            raise ValueError(f"label-definitions category '{category}' not found in taxonomy")
        if not isinstance(entries, dict):
            raise ValueError(f"label-definitions category '{category}' must be an object")
        expected_labels = set(taxonomy[category])
        defined_labels = set(entries.keys())
        missing_labels = sorted(expected_labels - defined_labels)
        extra_labels = sorted(defined_labels - expected_labels)
        if missing_labels:
            raise ValueError(f"label-definitions category '{category}' missing labels: {', '.join(missing_labels)}")
        if extra_labels:
            raise ValueError(f"label-definitions category '{category}' has unknown labels: {', '.join(extra_labels)}")
        for label_key, entry in entries.items():
            if not isinstance(entry, dict):
                raise ValueError(f"label-definitions entry '{category}.{label_key}' must be an object")
            missing_fields = sorted(required_entry_fields - set(entry.keys()))
            if missing_fields:
                raise ValueError(
                    f"label-definitions entry '{category}.{label_key}' missing fields: {', '.join(missing_fields)}"
                )
            for field_name in required_entry_fields:
                val = entry.get(field_name)
                if not isinstance(val, str) or not val.strip():
                    raise ValueError(f"label-definitions '{category}.{label_key}.{field_name}' must be non-empty")


def validate_taxonomy(
    path: Path = TAXONOMY_PATH,
    *,
    definitions_path: Path = LABEL_DEFINITIONS_PATH,
) -> None:
    load_taxonomy_document(path)
    if definitions_path.exists():
        validate_label_definitions(path, definitions_path)
