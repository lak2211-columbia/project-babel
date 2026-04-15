from __future__ import annotations

from pathlib import Path

from observatory.source_registry import ROOT


PROMPTS_DIR = ROOT / "prompts"


def load_prompt(filename: str) -> str:
    path = PROMPTS_DIR / filename
    return path.read_text(encoding="utf-8").strip()

