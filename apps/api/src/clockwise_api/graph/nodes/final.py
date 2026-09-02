"""Final response node: assembles the plan into a short readable wrap-up.

Runs after the itinerary is drafted (and, from Phase 4, after human approval).
Reads the itinerary + budget and writes a brief ``summary``. Uses the synthesis
model tier (see model_config).
"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from ...observability import span
from ..state import TravelState
from . import gateway_from

_SYSTEM = (
    "You are the final response agent for a trip planner. In 2-3 sentences, "
    "summarize the plan for the traveler: destination, length, the standout of "
    "the itinerary, and the estimated total cost. Warm and concise."
)


def _mock_summary(state: TravelState) -> str:
    constraints = state.get("trip_constraints", {}) or {}
    budget = state.get("budget_analysis", {}) or {}
    destination = constraints.get("destination") or "your destination"
    days = constraints.get("duration_days") or 3
    total = budget.get("grand_total")
    currency = budget.get("currency", "USD")
    cost = f" Estimated total: {currency} {total:,.0f}." if total else ""
    return (
        f"Here's your {days}-day plan for {destination}, with weather-aware "
        f"days and a hand-picked hotel.{cost} Review the itinerary below."
    )


async def final_node(state: TravelState, config: RunnableConfig) -> dict[str, Any]:
    gateway = gateway_from(config)
    with span("node.final"):
        result = await gateway.complete_text(
            node="final",
            system=_SYSTEM,
            user=(
                f"Constraints: {state.get('trip_constraints', {})}\n"
                f"Budget: {state.get('budget_analysis', {})}\n"
                f"Itinerary:\n{state.get('itinerary_plan', '')}"
            ),
            mock=_mock_summary(state),
        )
    return {
        "summary": result.content,
        "messages": [{"role": "assistant", "content": result.content}],
        "llm_calls": [result.as_call_record()],
    }
