from abc import ABC, abstractmethod
from typing import Any, Optional
from pydantic import BaseModel

class RuleViolation(BaseModel):
    rule_name: str
    severity: str # low, medium, high, critical
    details: dict[str, Any]

class BaseRule(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    def severity(self) -> str:
        return "medium"

    @abstractmethod
    async def check(self, trace_data: dict[str, Any], context: dict[str, Any]) -> Optional[RuleViolation]:
        pass
