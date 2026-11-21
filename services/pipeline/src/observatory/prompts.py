from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from observatory.source_registry import ROOT
from observatory.taxonomy import LABEL_DEFINITIONS_PATH, load_label_definitions


PROMPTS_DIR = ROOT / "prompts"

CATEGORY_HEADINGS = {
    "binding_strength": "Binding Strength Labels",
    "policy_requirements": "Policy Requirement Labels",
    "obligation_strengths": "Obligation Strength Labels",
    "enforcement_mechanisms": "Enforcement Mechanism Labels",
    "risk_framings": "Risk Framing Labels",
    "corpus_roles": "Corpus Role Labels",
    "lifecycle_stages": "Lifecycle Stage Labels",
}

DEFAULT_PROMPT_CATEGORIES = (
    "binding_strength",
    "policy_requirements",
    "obligation_strengths",
    "enforcement_mechanisms",
    "risk_framings",
)


def load_prompt(filename: str) -> str:
    path = PROMPTS_DIR / filename
    return path.read_text(encoding="utf-8").strip()


def render_codebook_definitions_markdown(
    categories: Sequence[str] = DEFAULT_PROMPT_CATEGORIES,
    *,
    definitions_path: Path = LABEL_DEFINITIONS_PATH,
) -> str:
    """Render canonical codebook label definitions (definition, include_when, exclude_when) from JSON."""
    payload = load_label_definitions(definitions_path)
    all_categories = payload.get("categories", {})
    version = payload.get("taxonomy_version", "2.1.0")

    lines: list[str] = [
        f"## Canonical Observatory Codebook Definitions (Taxonomy v{version})",
        "Follow every include/exclude boundary strictly. Do NOT assign a label when an exclude_when condition applies.",
    ]
    for category in categories:
        entries = all_categories.get(category)
        if not isinstance(entries, dict) or not entries:
            continue
        heading = CATEGORY_HEADINGS.get(category, category.replace("_", " ").title())
        lines.append("")
        lines.append(f"### {heading}")
        for key, entry in entries.items():
            lines.append(
                f"- `{key}` ({entry['label']}): {entry['definition']} "
                f"Include when: {entry['include_when']} "
                f"Exclude when: {entry['exclude_when']}"
            )
    return "\n".join(lines).strip()


def build_shared_codebook_system_prefix(
    *,
    definitions_path: Path = LABEL_DEFINITIONS_PATH,
) -> str:
    """Single shared cacheable system prefix across policy metadata, controls, and risk framing calls."""
    codebook_block = render_codebook_definitions_markdown(
        DEFAULT_PROMPT_CATEGORIES,
        definitions_path=definitions_path,
    )
    return (
        "You are an expert legal and AI-governance policy coder for Project Babel (AI Governance Observatory).\n\n"
        "Universal Coding & Grounding Rules:\n"
        "1. Return ONLY valid JSON matching the task's JSON schema. Never output markdown fences or prose.\n"
        "2. Every evidence span `quote` MUST be an exact, contiguous verbatim substring copied directly from "
        "the provided document text in its original language (no ellipses `...`, no paraphrasing, no stitched clauses). "
        "Keep each quote concise (at most 400 characters) and provide at most 2 spans per label or frame. "
        "For non-English sources (Chinese, Japanese, Korean), put the exact original-language passage in `quote` "
        "and an accurate English translation in `quote_en`.\n"
        "3. Every assigned safety requirement and enforcement mechanism MUST include at least 1 verbatim evidence span.\n"
        "4. When analyzing a chunk (`Chunk: i/N`) of a longer document, code strictly from the provided chunk text; "
        "never infer unprovided sections or fabricate quotes.\n\n"
        f"{codebook_block}"
    )


def render_prompt_with_definitions(
    filename: str,
    categories: Sequence[str],
    *,
    definitions_path: Path = LABEL_DEFINITIONS_PATH,
) -> str:
    base_prompt = load_prompt(filename)
    codebook_block = render_codebook_definitions_markdown(categories, definitions_path=definitions_path)
    return f"{base_prompt}\n\n{codebook_block}"
