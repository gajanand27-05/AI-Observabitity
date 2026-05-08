"""Locked bake-off lineup for the AI Observability project.

The 12 representatives picked for Phase 1.5 (model bake-off).
Full list of all 39 available models lives in /AVAILABLE_MODELS.txt.

Selection criteria: cover family + size diversity per tier without redundancy.
Specialized models (vision, code-tuned) are excluded from this default lineup.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Tier = Literal["tiny", "mid", "large", "flagship", "bonus"]


@dataclass(frozen=True)
class ModelInfo:
    id: str
    family: str
    tier: Tier
    approx_size: str
    notes: str = ""


BAKE_OFF_MODELS: list[ModelInfo] = [
    ModelInfo("gemma3:4b",            "google",   "tiny",     "~4B"),
    ModelInfo("ministral-3:8b",       "mistral",  "tiny",     "~8B"),
    ModelInfo("gpt-oss:20b",          "openai",   "tiny",     "~20B"),

    ModelInfo("nemotron-3-nano:30b",  "nvidia",   "mid",      "~30B"),
    ModelInfo("gemma4:31b",           "google",   "mid",      "~31B"),
    ModelInfo("qwen3-next:80b",       "alibaba",  "mid",      "~80B"),

    ModelInfo("gpt-oss:120b",         "openai",   "large",    "~120B"),
    ModelInfo("nemotron-3-super",     "nvidia",   "large",    "~230B"),

    ModelInfo("kimi-k2.6",            "moonshot", "flagship", "~600B"),
    ModelInfo("deepseek-v4-pro",      "deepseek", "flagship", "flagship"),
    ModelInfo("glm-5.1",              "zhipu",    "flagship", "flagship"),

    ModelInfo("kimi-k2-thinking",     "moonshot", "bonus",    "~1T",
              "Reasoning model with explicit CoT — useful for studying overthinking on simple RAG queries"),
]


TIER_ORDER: tuple[Tier, ...] = ("tiny", "mid", "large", "flagship", "bonus")


def by_tier(tier: Tier) -> list[ModelInfo]:
    return [m for m in BAKE_OFF_MODELS if m.tier == tier]


def by_id(model_id: str) -> ModelInfo | None:
    return next((m for m in BAKE_OFF_MODELS if m.id == model_id), None)


def all_ids() -> list[str]:
    return [m.id for m in BAKE_OFF_MODELS]


if __name__ == "__main__":
    for tier in TIER_ORDER:
        models = by_tier(tier)
        if not models:
            continue
        print(f"\n[{tier.upper()}]  ({len(models)} models)")
        for m in models:
            print(f"  {m.id:<28} {m.family:<10} {m.approx_size}")
    print(f"\nTotal: {len(BAKE_OFF_MODELS)} models")
