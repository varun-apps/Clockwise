"""Supervisor node: understands the request and routes.

Emits schema-valid `selected_agents`, `trip_constraints`, and `reasoning`. In
mock mode it derives constraints heuristically from the query so offline runs
are deterministic; in live mode the LLM produces the same structured shape.
"""

from __future__ import annotations

import re
from typing import Any

from langchain_core.runnables import RunnableConfig

from ...observability import span
from ..state import TravelState
from . import gateway_from

_SYSTEM = (
    "You are the supervisor of a multi-agent trip planner. Read the user's "
    "request and return JSON with: trip_constraints (destination, origin, "
    "duration_days, start_date, travelers, budget, notes), selected_agents "
    "(subset of flight, hotel, weather, budget, itinerary), and reasoning "
    "(one sentence). Only choose agents the request actually needs."
)

_DURATION_RE = re.compile(r"(\d+)\s*[- ]?\s*day", re.IGNORECASE)
# No IGNORECASE: only capture capitalized proper nouns as the destination.
_DEST_RE = re.compile(r"\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)")


def _heuristic(query: str) -> dict[str, Any]:
    duration = None
    if m := _DURATION_RE.search(query):
        duration = int(m.group(1))
    destination = None
    if m := _DEST_RE.search(query):
        destination = m.group(1).strip()
    constraints = {
        "destination": destination,
        "origin": None,
        "duration_days": duration,
        "start_date": None,
        "travelers": None,
        "budget": None,
        "notes": None,
    }
    return {
        "trip_constraints": constraints,
        "selected_agents": ["flight", "hotel", "weather", "budget", "itinerary"],
        "reasoning": (
            f"Planning a {duration or 'multi'}-day trip"
            + (f" to {destination}" if destination else "")
            + "; gather flights, hotels and weather, then budget and itinerary."
        ),
    }


async def supervisor_node(state: TravelState, config: RunnableConfig) -> dict[str, Any]:
    query = state.get("user_query", "")
    gateway = gateway_from(config)
    with span("node.supervisor"):
        data, call = await gateway.complete_json(
            node="supervisor",
            system=_SYSTEM,
            user=query,
            mock=_heuristic(query),
        )
    return {
        "trip_constraints": data.get("trip_constraints", {}),
        "selected_agents": data.get("selected_agents", ["weather", "itinerary"]),
        "reasoning": data.get("reasoning", ""),
        "llm_calls": [call.as_call_record()],
    }


# Tool specialists that participate in the parallel fan-out.
_FANOUT_AGENTS = ("flight", "hotel", "weather")


def route_to_specialists(state: TravelState) -> list[str]:
    """Conditional fan-out: schedule the selected tool specialists in parallel.

    Returns the subset of selected agents that are tool specialists. If none are
    selected, routes straight to budget (the fan-in convergence node).
    """
    selected = state.get("selected_agents", []) or []
    fanout = [a for a in _FANOUT_AGENTS if a in selected]
    return fanout or ["budget"]
