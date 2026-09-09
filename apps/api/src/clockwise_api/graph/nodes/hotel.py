"""Hotel specialist — tool-calling, runs in the parallel fan-out.

Reads destination + duration from trip_constraints, calls the in-process hotel
tool (frozen fixtures in mock mode), writes ``hotel_results``.
"""

from __future__ import annotations

from typing import Any

from ...observability import span
from ...schemas import HotelOption
from ...tools.hotels import get_hotels
from ..state import TravelState


async def hotel_node(state: TravelState) -> dict[str, Any]:
    constraints = state.get("trip_constraints")
    destination = constraints.destination if constraints else None
    nights = constraints.duration_days if constraints else None
    with span("node.hotel"):
        results = get_hotels(destination, nights)
    hotels = [HotelOption(**o) for o in results]
    return {
        "hotel_results": hotels,
        "messages": [{"role": "assistant", "content": f"Found {len(hotels)} hotel options."}],
    }
