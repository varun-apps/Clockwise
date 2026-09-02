"""Weather specialist — the one real tool-calling specialist in the slice.

It reads the destination from trip_constraints, calls the in-process weather
tool (frozen fixtures in mock mode), and normalizes the result into
`weather_info`. This is the template every Phase 3 specialist follows.
"""

from __future__ import annotations

from typing import Any

from ...observability import span
from ...tools.weather import get_weather
from ..state import TravelState


async def weather_node(state: TravelState) -> dict[str, Any]:
    constraints = state.get("trip_constraints", {}) or {}
    destination = constraints.get("destination")
    with span("node.weather"):
        info = get_weather(destination)
    return {
        "weather_info": info,
        "messages": [
            {"role": "assistant", "content": f"Weather gathered for {info['destination']}."}
        ],
    }
