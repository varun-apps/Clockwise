"""Human-in-the-loop review node.

Pauses the graph after the itinerary is drafted via LangGraph ``interrupt()``.
The graph checkpoints and returns to the caller; a later resume supplies the
decision as the interrupt's return value (see routers/plan.py::resume).

Decision shape (provided on resume):
    {"action": "approve"}
    {"action": "request_changes", "feedback": "<what to change>"}

Approve continues to ``final``; request_changes loops back to ``itinerary`` with
the feedback recorded in state so it re-drafts.
"""

from __future__ import annotations

from typing import Any

from langgraph.types import interrupt

from ...schemas import ReviewDecision
from ..state import TravelState


async def human_review_node(state: TravelState) -> dict[str, Any]:
    decision: dict[str, Any] = interrupt(
        {
            "type": "itinerary_review",
            "itinerary_plan": state.get("itinerary_plan"),
            "budget": state.get("budget_analysis"),
        }
    )
    review = ReviewDecision(**decision)
    update: dict[str, Any] = {"review_decision": review}
    if review.action == "request_changes":
        update["revision_feedback"] = review.feedback or ""
    return update


def route_after_review(state: TravelState) -> str:
    """approve -> final; request_changes -> back to itinerary for a re-draft."""
    review = state.get("review_decision")
    action = review.action if review is not None else "approve"
    return "itinerary" if action == "request_changes" else "final"
