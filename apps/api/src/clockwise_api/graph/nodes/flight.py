"""Flight specialist — tool-calling, runs in the parallel fan-out.

Reads origin/destination from trip_constraints, calls the in-process flight
tool (frozen fixtures in mock mode), writes ``flight_results``.
"""

from __future__ import annotations

from typing import Any

from ...observability import span
from ...schemas import FlightOption
from ...tools.flights import get_flights
from ..state import TravelState


async def flight_node(state: TravelState) -> dict[str, Any]:
    constraints = state.get("trip_constraints")
    origin = constraints.origin if constraints else None
    destination = constraints.destination if constraints else None
    with span("node.flight"):
        results = get_flights(origin, destination)
    flights = [FlightOption(**o) for o in results]
    return {
        "flight_results": flights,
        "messages": [{"role": "assistant", "content": f"Found {len(flights)} flight options."}],
    }
