from __future__ import annotations

import json
from pathlib import Path

from observatory.coverage import TRACKING_DIR
from observatory.source_ops import build_source_operations_model
from observatory.source_registry import ROOT


EXPANSION_PLAN_JSON_PATH = TRACKING_DIR / "source_expansion_plan.json"
EXPANSION_PLAN_MARKDOWN_PATH = ROOT / "docs" / "operations" / "source-expansion-plan.md"


def _display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def build_source_expansion_plan() -> dict:
    plan = build_source_operations_model()
    plan["plan_json_path"] = _display_path(EXPANSION_PLAN_JSON_PATH)
    plan["plan_markdown_path"] = _display_path(EXPANSION_PLAN_MARKDOWN_PATH)
    return plan


def _render_markdown(plan: dict) -> str:
    lines: list[str] = []
    lines.append("# Source Expansion Plan")
    lines.append("")
    lines.append(
        "This file is generated from the official source inventory plus cached discovery results. "
        "It is family-based rather than page-based, so wrapper pages, translations, FAQs, and PDFs can be planned together."
    )
    lines.append("")
    lines.append(f"- Generated at: `{plan['generated_at']}`")
    lines.append(f"- JSON mirror: `{plan['plan_json_path']}`")
    lines.append("")
    lines.append("## Highest-Value Next Families")
    lines.append("")
    lines.append("| Jurisdiction | Portal | Recommendation | Role | Bucket | Family | Representative candidate |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for family in plan["global_priority_families"][:15]:
        lines.append(
            f"| `{family['jurisdiction']}` | `{family['portal_id']}` | `{family['best_recommendation']}` | "
            f"`{family['best_source_role']}` | `{family['coverage_bucket']}` | `{family['family_label']}` | "
            f"[{family['representative_title'] or family['representative_url']}]({family['representative_url']}) |"
        )
    if not plan["global_priority_families"]:
        lines.append("| `n/a` | `n/a` | `n/a` | `n/a` | `n/a` | `n/a` | No high-signal new families in the current cache. |")
    lines.append("")

    for jurisdiction in plan["jurisdictions"]:
        coverage = jurisdiction["coverage_snapshot"]
        target = coverage["target_range"]
        lines.append(f"## {jurisdiction['jurisdiction']}")
        lines.append("")
        lines.append(jurisdiction["description"])
        lines.append("")
        lines.append(
            f"- Current corpus: `{coverage['seed_document_count']}` seed documents across `{coverage['portal_count']}` portals"
        )
        lines.append(
            f"- Target range: `minimum={target['minimum']}` / `working={target['target']}` / `upper={target['maximum']}`"
        )
        lines.append(f"- Gap to minimum comprehensive floor: `{coverage['gap_to_minimum']}`")
        lines.append(
            "- Current source tiers: "
            + ", ".join(f"`{label}={count}`" for label, count in coverage["source_tier_counts"].items())
        )
        lines.append(
            "- Current policy domains: "
            + ", ".join(f"`{label}={count}`" for label, count in coverage["policy_domain_counts"].items())
        )
        lines.append("")
        lines.append("### Portal Operations")
        lines.append("")
        lines.append("| Portal | Existing seeds | Families | High-signal families | Expected buckets | Covered buckets | Missing buckets | Suggested action |")
        lines.append("| --- | ---: | ---: | ---: | --- | --- | --- | --- |")
        for portal in jurisdiction["portal_operations"]:
            lines.append(
                f"| `{portal['portal_id']}` | `{portal['existing_seed_count']}` | `{portal['family_count']}` | "
                f"`{portal['high_signal_family_count']}` | "
                f"`{', '.join(portal['expected_coverage_buckets']) or 'n/a'}` | "
                f"`{', '.join(portal['covered_coverage_buckets']) or 'n/a'}` | "
                f"`{', '.join(portal['missing_coverage_buckets']) or 'n/a'}` | "
                f"`{portal['suggested_action']}` |"
            )
        lines.append("")
        lines.append("### Priority Families")
        lines.append("")
        lines.append("| Recommendation | Score | Role | Bucket | Family | Representative candidate |")
        lines.append("| --- | ---: | --- | --- | --- | --- |")
        for family in jurisdiction["priority_families"]:
            lines.append(
                f"| `{family['best_recommendation']}` | `{family['best_candidate_score']}` | `{family['best_source_role']}` | "
                f"`{family['coverage_bucket']}` | `{family['family_label']}` | "
                f"[{family['representative_title'] or family['representative_url']}]({family['representative_url']}) |"
            )
        if not jurisdiction["priority_families"]:
            lines.append("| `n/a` | `0` | `n/a` | `n/a` | `n/a` | No unpromoted high-signal families in the current cache. |")
        lines.append("")

    return "\n".join(lines) + "\n"


def write_source_expansion_plan() -> dict:
    plan = build_source_expansion_plan()
    EXPANSION_PLAN_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    EXPANSION_PLAN_JSON_PATH.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    EXPANSION_PLAN_MARKDOWN_PATH.parent.mkdir(parents=True, exist_ok=True)
    EXPANSION_PLAN_MARKDOWN_PATH.write_text(_render_markdown(plan), encoding="utf-8")
    return plan
