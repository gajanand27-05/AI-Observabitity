from __future__ import annotations

import json
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from ..supabase_client import supabase


@dataclass
class Span:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    kind: str = "llm_call"
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    input_json: Optional[dict] = None
    output_json: Optional[dict] = None
    error: Optional[str] = None
    ord: int = 0

    def finish(self, output: Optional[dict] = None, error: Optional[str] = None):
        self.ended_at = datetime.now(timezone.utc)
        self.duration_ms = int((self.ended_at - self.started_at).total_seconds() * 1000)
        self.output_json = output
        self.error = error


class Trace:
    def __init__(
        self,
        user_id: str,
        question: str,
        model_id: Optional[str] = None,
        embedder_id: Optional[str] = None,
    ):
        self.id = str(uuid.uuid4())
        self.user_id = user_id
        self.question = question
        self.model_id = model_id
        self.embedder_id = embedder_id
        self.created_at = datetime.now(timezone.utc)
        self.spans: list[Span] = []
        self.final_answer: Optional[str] = None
        self.total_tokens: int = 0
        self.prompt_tokens: int = 0
        self.completion_tokens: int = 0
        self.estimated_cost_usd: float = 0.0
        self.prompt_version: Optional[str] = None
        self.metadata: dict[str, Any] = {}
        self._start_time = time.perf_counter()

    @asynccontextmanager
    async def span(self, kind: str, input_json: Optional[dict] = None):
        span = Span(kind=kind, input_json=input_json, ord=len(self.spans))
        self.spans.append(span)
        try:
            yield span
        except Exception as e:
            span.finish(error=str(e))
            raise
        else:
            if span.ended_at is None:
                span.finish()

    def set_llm_metrics(self, prompt_tokens: int, completion_tokens: int, cost: float):
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = prompt_tokens + completion_tokens
        self.estimated_cost_usd = cost

    async def flush(self, status: str = "ok"):
        total_latency_ms = int((time.perf_counter() - self._start_time) * 1000)
        
        # 1. Insert Trace
        trace_row = {
            "id": self.id,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat(),
            "question": self.question,
            "final_answer": self.final_answer,
            "model_id": self.model_id,
            "embedder_id": self.embedder_id,
            "total_latency_ms": total_latency_ms,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "estimated_cost_usd": self.estimated_cost_usd,
            "status": status,
            "prompt_version": self.prompt_version,
            "metadata": self.metadata,
        }
        
        try:
            supabase.table("traces").insert(trace_row).execute()
            
            # 2. Insert Spans
            if self.spans:
                span_rows = [
                    {
                        "id": s.id,
                        "trace_id": self.id,
                        "ord": s.ord,
                        "kind": s.kind,
                        "started_at": s.started_at.isoformat(),
                        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
                        "duration_ms": s.duration_ms,
                        "input_json": s.input_json,
                        "output_json": s.output_json,
                        "error": s.error,
                    }
                    for s in self.spans
                ]
                supabase.table("spans").insert(span_rows).execute()
        except Exception as e:
            # For Phase 2, we log errors but don't crash the request if tracing fails
            print(f"TRACING ERROR: {e}")
