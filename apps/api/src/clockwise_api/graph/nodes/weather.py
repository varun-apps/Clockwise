"""Weather specialist — the one real tool-calling specialist in the slice.

It reads the destination from trip_constraints, calls the in-process weather
tool (frozen fixtures in mock mode), and normalizes the result into
`weather_info`. This is the template every Phase 3 specialist follows.
"""

from __future__ import annotations

from typing import Any

from ...observability import span
from ...schemas import WeatherInfo
from ...tools.weather import get_weather
from ..state import TravelState


async def weather_node(state: TravelState) -> dict[str, Any]:
    constraints = state.get("trip_constraints")
    destination = constraints.destination if constraints else None
    with span("node.weather"):
        info = get_weather(destination)
    weather = WeatherInfo(**info)
    return {
        "weather_info": weather,
        "messages": [
            {"role": "assistant", "content": f"Weather gathered for {weather.destination}."}
        ],
    }
