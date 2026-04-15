from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List


ROOT = Path(__file__).resolve().parents[4]
TAXONOMY_PATH = ROOT / "data" / "taxonomies" / "observatory-taxonomy.json"

REQUIRED_KEYS = {
    "jurisdictions",
    "document_types",
    "binding_strength",
    "issuer_types",
    "source_tiers",
    "policy_domains",
    "lifecycle_stages",
    "policy_requirements",
    "enforcement_mechanisms",
    "application_domains",
    "risk_framings",
}


def load_taxonomy(path: Path = TAXONOMY_PATH) -> Dict[str, List[str]]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    missing = REQUIRED_KEYS.difference(payload)
    if missing:
        missing_items = ", ".join(sorted(missing))
        raise ValueError(f"taxonomy missing required keys: {missing_items}")

    for key, values in payload.items():
        if not isinstance(values, list) or not values:
            raise ValueError(f"taxonomy category '{key}' must be a non-empty list")
        duplicates = {value for value in values if values.count(value) > 1}
        if duplicates:
            duplicate_items = ", ".join(sorted(duplicates))
            raise ValueError(f"taxonomy category '{key}' has duplicates: {duplicate_items}")

    return payload


def validate_taxonomy() -> None:
    load_taxonomy()
