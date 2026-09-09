"""Interpret a finished graph run into its terminal API outcome.

Single source of truth for the two facts both the blocking endpoints
(`/plan`, `/plan/resume`) and the streaming endpoints (`/plan/stream`,
`/plan/resume/stream`) must agree on:

  * whether the run is paused awaiting human review, and
  * the terminal `PlanResponse` (blocked | awaiting_review | completed).

Both endpoint families feed their final state here so the two can't drift.
"""

from __future__ import annotations

import uuid
from typing import Any

from ..schemas import (
    LLMCall,
    PlanResponse,
)


def is_paused_at_review(next_nodes: Any) -> bool:
    """True when the graph is paused at the ``human_review`` node.

    ``next_nodes`` is the ``snapshot.next`` list from the compiled graph: it
    names the node(s) the graph would resume at, so ``("human_review",)`` means
    the run is awaiting approval.
    """
    return "human_review" in (next_nodes or ())


def plan_response(
    *,
    conversation_id: uuid.UUID,
    thread_id: str,
    state: dict[str, Any],
    next_nodes: Any = None,
) -> PlanResponse:
    """Build the terminal `PlanResponse` for a finished (or paused) run.

    ``state`` is the authoritative graph state (``snapshot.values``). When
    ``next_nodes`` contains ``"human_review"`` the run paused at review and the
    response is ``awaiting_review`` with no summary yet.
    """
    guardrail = state.get("guardrail")
    if guardrail is not None and guardrail.decision == "BLOCK":
        return PlanResponse(
            conversation_id=conversation_id,
            thread_id=thread_id,
            status="blocked",
            blocked_reason=guardrail.reason or "Request blocked.",
            llm_calls=[LLMCall(**c) for c in state.get("llm_calls", [])],
        )

    resp = PlanResponse(
        conversation_id=conversation_id,
        thread_id=thread_id,
        status="completed",
        reasoning=state.get("reasoning"),
        selected_agents=state.get("selected_agents", []),
        trip_constraints=state.get("trip_constraints"),
        weather=state.get("weather_info"),
        flights=state.get("flight_results", []) or [],
        hotels=state.get("hotel_results", []) or [],
        budget=state.get("budget_analysis"),
        itinerary_plan=state.get("itinerary_plan"),
        summary=state.get("summary"),
        memory_used=state.get("memory_context", []) or [],
        llm_calls=[LLMCall(**c) for c in state.get("llm_calls", [])],
    )

    if is_paused_at_review(next_nodes):
        resp.status = "awaiting_review"
        resp.summary = None
    return resp
