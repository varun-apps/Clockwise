"""Hotel specialist — tool-calling, runs in the parallel fan-out.

Reads destination + duration from trip_constraints, calls the in-process hotel
tool (frozen fixtures in mock mode), writes ``hotel_results``.
"""

from __future__ import annotations

from typing import Any

from ...observability import span
from ...tools.hotels import get_hotels
from ..state import TravelState


async def hotel_node(state: TravelState) -> dict[str, Any]:
    constraints = state.get("trip_constraints", {}) or {}
    with span("node.hotel"):
        results = get_hotels(constraints.get("destination"), constraints.get("duration_days"))
    return {
        "hotel_results": results,
        "messages": [{"role": "assistant", "content": f"Found {len(results)} hotel options."}],
    }
