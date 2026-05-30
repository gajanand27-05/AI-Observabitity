from .engine import RulesEngine
from .basic import EmptyRetrievalRule, HighLatencyRule, LengthAnomalyRule

# Instantiate the default engine with our basic rules
default_engine = RulesEngine([
    EmptyRetrievalRule(),
    HighLatencyRule(threshold_ms=20000), # 20s threshold
    LengthAnomalyRule()
])
