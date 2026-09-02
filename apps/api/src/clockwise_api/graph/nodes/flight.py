"""Flight specialist — tool-calling, runs in the parallel fan-out.

Reads origin/destination from trip_constraints, calls the in-process flight
tool (frozen fixtures in mock mode), writes ``flight_results``.
"""

from __future__ import annotations

from typing import Any

from ...observability import span
from ...tools.flights import get_flights
from ..state import TravelState


async def flight_node(state: TravelState) -> dict[str, Any]:
    constraints = state.get("trip_constraints", {}) or {}
    with span("node.flight"):
        results = get_flights(constraints.get("origin"), constraints.get("destination"))
    return {
        "flight_results": results,
        "messages": [{"role": "assistant", "content": f"Found {len(results)} flight options."}],
    }
