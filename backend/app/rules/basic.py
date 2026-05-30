from typing import Any, Optional
from .base import BaseRule, RuleViolation

class EmptyRetrievalRule(BaseRule):
    @property
    def name(self) -> str:
        return "empty_retrieval"
    
    @property
    def severity(self) -> str:
        return "high"

    async def check(self, trace_data: dict[str, Any], context: dict[str, Any]) -> Optional[RuleViolation]:
        chunks = context.get("chunks", [])
        if not chunks:
            return RuleViolation(
                rule_name=self.name,
                severity=self.severity,
                details={"message": "No context chunks were retrieved for this query."}
            )
        
        # Check if all chunks have very low scores (threshold 0.1)
        if all(getattr(c, 'score', 0) < 0.1 for c in chunks):
            return RuleViolation(
                rule_name=self.name,
                severity=self.severity,
                details={"message": "All retrieved chunks have scores below 0.1 threshold."}
            )
        return None

class HighLatencyRule(BaseRule):
    def __init__(self, threshold_ms: int = 15000):
        self.threshold_ms = threshold_ms

    @property
    def name(self) -> str:
        return "high_latency"
    
    @property
    def severity(self) -> str:
        return "medium"

    async def check(self, trace_data: dict[str, Any], context: dict[str, Any]) -> Optional[RuleViolation]:
        latency = trace_data.get("total_latency_ms", 0)
        if latency > self.threshold_ms:
            return RuleViolation(
                rule_name=self.name,
                severity=self.severity,
                details={
                    "message": f"Latency of {latency}ms exceeded threshold of {self.threshold_ms}ms.",
                    "latency_ms": latency,
                    "threshold_ms": self.threshold_ms
                }
            )
        return None

class LengthAnomalyRule(BaseRule):
    @property
    def name(self) -> str:
        return "length_anomaly"
    
    @property
    def severity(self) -> str:
        return "low"

    async def check(self, trace_data: dict[str, Any], context: dict[str, Any]) -> Optional[RuleViolation]:
        answer = trace_data.get("final_answer", "")
        if not answer:
            return None
        
        # Very short answer might be a refusal or a failure
        if len(answer.strip()) < 15:
            # Check if it looks like a refusal
            refusals = ["i don't know", "no information", "not found", "sorry"]
            if any(r in answer.lower() for r in refusals):
                return None
            
            return RuleViolation(
                rule_name=self.name,
                severity=self.severity,
                details={
                    "message": f"Answer is unusually short ({len(answer)} chars) and doesn't look like a standard refusal.",
                    "length": len(answer)
                }
            )
        return None
