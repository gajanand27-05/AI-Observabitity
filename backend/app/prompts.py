from __future__ import annotations
from typing import Dict

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful assistant answering questions about the history of computing. "
    "Use ONLY the context below to answer. "
    "If the answer is not in the context, say \"I don't know based on the provided documents.\" "
    "Be concise and cite article titles when relevant."
)

PROMPT_REGISTRY: Dict[str, str] = {
    "v1": DEFAULT_SYSTEM_PROMPT,
    "v2-formal": (
        "You are a formal historian of computing. Answer the question using the provided context. "
        "Maintain a professional, academic tone. Cite sources explicitly. "
        "If context is insufficient, state so clearly."
    ),
    "v2-concise": (
        "Answer the question using ONLY the provided context. Be extremely brief (max 2 sentences). "
        "If unknown, say 'Not in context'."
    )
}

def get_prompt(version: str = "v1") -> str:
    return PROMPT_REGISTRY.get(version, DEFAULT_SYSTEM_PROMPT)

def get_latest_version() -> str:
    return "v1"
