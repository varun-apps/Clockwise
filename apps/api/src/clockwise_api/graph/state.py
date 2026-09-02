"""TravelState — the shared object that is the whole contract between agents.

The shape mirrors the architecture's TravelState read/write map. The thin slice
fills only a subset (constraints, weather, itinerary); the remaining fields are
present so Phase 3 specialists just fill them in. `messages` and `llm_calls`
use additive reducers so parallel fan-out (Phase 3) merges cleanly.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict


class TravelState(TypedDict, total=False):
    user_query: str
    user_id: str

    # Long-term memory (LangMem-style, loaded from / written to the store)
    memory_context: list[str]  # preferences loaded for this user
    memory_saved: list[str]  # preferences persisted at the end of this run

    # Guardrail
    guardrail: dict[str, Any]  # {"decision": "PASS"|"BLOCK", "reason": str}

    # Supervisor
    trip_constraints: dict[str, Any]
    selected_agents: list[str]
    reasoning: str

    # Specialist outputs
    flight_results: list[dict[str, Any]]
    hotel_results: list[dict[str, Any]]
    weather_info: dict[str, Any]
    budget_analysis: dict[str, Any]
    itinerary_plan: str
    summary: str

    # Human-in-the-loop review
    review_decision: dict[str, Any]  # {"action": "approve"|"request_changes", "feedback": str}
    revision_feedback: str

    # Cross-cutting
    messages: Annotated[list[dict[str, Any]], operator.add]
    llm_calls: Annotated[list[dict[str, Any]], operator.add]
