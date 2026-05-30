from typing import Any
from .base import BaseRule, RuleViolation
from ..supabase_client import supabase

class RulesEngine:
    def __init__(self, rules: list[BaseRule]):
        self.rules = rules

    async def run_all(self, trace_data: dict[str, Any], context: dict[str, Any]) -> list[RuleViolation]:
        violations = []
        for rule in self.rules:
            try:
                violation = await rule.check(trace_data, context)
                if violation:
                    violations.append(violation)
            except Exception as e:
                print(f"Error running rule {rule.name}: {e}")
        return violations

    async def save_violations(self, trace_id: str, violations: list[RuleViolation]):
        if not violations:
            return
        
        rows = [
            {
                "trace_id": trace_id,
                "rule_name": v.rule_name,
                "severity": v.severity,
                "details": v.details
            }
            for v in violations
        ]
        try:
            supabase.table("rule_violations").insert(rows).execute()
        except Exception as e:
            print(f"Error saving violations for trace {trace_id}: {e}")
