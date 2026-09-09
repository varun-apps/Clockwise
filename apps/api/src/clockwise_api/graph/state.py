"""TravelState — the shared object that is the whole contract between agents.

Structured fields are the Pydantic models from `schemas.py`, so the state
channel is typed and validated at the node that writes it — a bad write fails
there, not at the response boundary. `messages` and `llm_calls` use additive
reducers so parallel fan-out merges cleanly.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from ..schemas import (
    BudgetAnalysis,
    FlightOption,
    GuardrailDecision,
    HotelOption,
    ReviewDecision,
    TripConstraints,
    WeatherInfo,
)


class TravelState(TypedDict, total=False):
    user_query: str
    user_id: str

    # Long-term memory (LangMem-style, loaded from / written to the store)
    memory_context: list[str]  # preferences loaded for this user
    memory_saved: list[str]  # preferences persisted at the end of this run

    # Guardrail
    guardrail: GuardrailDecision

    # Supervisor
    trip_constraints: TripConstraints
    selected_agents: list[str]
    reasoning: str

    # Specialist outputs
    flight_results: list[FlightOption]
    hotel_results: list[HotelOption]
    weather_info: WeatherInfo
    budget_analysis: BudgetAnalysis
    itinerary_plan: str
    summary: str

    # Human-in-the-loop review
    review_decision: ReviewDecision
    revision_feedback: str

    # Cross-cutting
    messages: Annotated[list[dict[str, Any]], operator.add]
    llm_calls: Annotated[list[dict[str, Any]], operator.add]
