from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

from observatory.source_registry import ROOT
from observatory.url_safety import repo_rel_posix


SCHEMAS_DIR = ROOT / "packages" / "schemas"
TAXONOMY_DIR = ROOT / "data" / "taxonomies"
SOURCES_DIR = ROOT / "data" / "sources"
ANALYSIS_DIR = ROOT / "data" / "analysis"


def _load_validator(schema_path: Path) -> Draft202012Validator:
    if not schema_path.exists():
        raise FileNotFoundError(f"schema file not found: {schema_path}")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def _validate_file(
    validator: Draft202012Validator,
    artifact_path: Path,
    schema_name: str,
) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    try:
        payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [
            {
                "artifact": repo_rel_posix(artifact_path),
                "schema": schema_name,
                "path": "$",
                "message": f"{type(exc).__name__}: {exc}",
            }
        ]

    for err in sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path)):
        json_path = "$" + "".join(
            f"[{part}]" if isinstance(part, int) else f".{part}"
            for part in err.absolute_path
        )
        errors.append(
            {
                "artifact": repo_rel_posix(artifact_path),
                "schema": schema_name,
                "path": json_path,
                "message": err.message,
            }
        )
    return errors


def validate_repository_artifacts(
    *,
    schemas_dir: Path = SCHEMAS_DIR,
    taxonomy_dir: Path = TAXONOMY_DIR,
    sources_dir: Path = SOURCES_DIR,
    analysis_dir: Path = ANALYSIS_DIR,
) -> dict[str, Any]:
    """Validate committed taxonomy, label definitions, source manifests, and analysis JSON artifacts."""
    checks: list[dict[str, Any]] = []
    all_errors: list[dict[str, str]] = []
    total_validated = 0

    targets: list[tuple[str, Path, list[Path]]] = [
        (
            "observatory-taxonomy.schema.json",
            schemas_dir / "observatory-taxonomy.schema.json",
            [taxonomy_dir / "observatory-taxonomy.json"]
            if (taxonomy_dir / "observatory-taxonomy.json").exists()
            else [],
        ),
        (
            "label-definitions.schema.json",
            schemas_dir / "label-definitions.schema.json",
            [taxonomy_dir / "label-definitions.json"]
            if (taxonomy_dir / "label-definitions.json").exists()
            else [],
        ),
        (
            "source-manifest.schema.json",
            schemas_dir / "source-manifest.schema.json",
            sorted(sources_dir.glob("*.json")) if sources_dir.exists() else [],
        ),
        (
            "document-analysis.schema.json",
            schemas_dir / "document-analysis.schema.json",
            sorted(
                path
                for path in analysis_dir.glob("*/*/document_analysis.json")
                if path.parent.parent.name != "jurisdictions"
            )
            if analysis_dir.exists()
            else [],
        ),
        (
            "jurisdiction-analysis.schema.json",
            schemas_dir / "jurisdiction-analysis.schema.json",
            sorted((analysis_dir / "jurisdictions").glob("*/jurisdiction_analysis.json"))
            if (analysis_dir / "jurisdictions").exists()
            else [],
        ),
    ]

    for schema_name, schema_path, artifact_paths in targets:
        if not schema_path.exists():
            all_errors.append(
                {
                    "artifact": repo_rel_posix(schema_path),
                    "schema": schema_name,
                    "path": "$",
                    "message": f"missing schema file: {schema_path}",
                }
            )
            checks.append({"schema": schema_name, "count": 0, "errors": 1})
            continue

        validator = _load_validator(schema_path)
        group_errors = 0
        for artifact_path in artifact_paths:
            total_validated += 1
            file_errors = _validate_file(validator, artifact_path, schema_name)
            group_errors += len(file_errors)
            all_errors.extend(file_errors)
        checks.append(
            {
                "schema": schema_name,
                "count": len(artifact_paths),
                "errors": group_errors,
            }
        )

    return {
        "validated_count": total_validated,
        "error_count": len(all_errors),
        "checks": checks,
        "errors": all_errors,
    }
