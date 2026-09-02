"""Final response node: synthesizes the reviewable itinerary from state.

Uses the synthesis model tier (see model_config). In mock mode it assembles a
deterministic day-wise plan from the constraints + weather already in state.
"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from ...observability import span
from ..state import TravelState
from . import gateway_from

_SYSTEM = (
    "You are the final response agent for a trip planner. Using the trip "
    "constraints and gathered weather, write a concise, friendly day-by-day "
    "itinerary in Markdown. Be practical and reference the weather."
)


def _mock_plan(constraints: dict[str, Any], weather: dict[str, Any]) -> str:
    destination = constraints.get("destination") or "your destination"
    days = constraints.get("duration_days") or 3
    lines = [f"# {days}-Day Trip to {destination}", ""]
    if weather:
        lines.append(
            f"_Weather: {weather.get('summary', 'n/a')} "
            f"(avg {weather.get('avg_low_c', '?')}–{weather.get('avg_high_c', '?')}°C)_"
        )
        lines.append("")
    for day in range(1, int(days) + 1):
        if day == 1:
            lines.append(f"**Day {day}.** Arrive, settle in, and explore the area on foot.")
        elif day == int(days):
            lines.append(f"**Day {day}.** Relaxed morning, souvenirs, and departure.")
        else:
            lines.append(f"**Day {day}.** Key sights and a local meal; adjust for weather.")
    return "\n".join(lines)


async def final_node(state: TravelState, config: RunnableConfig) -> dict[str, Any]:
    constraints = state.get("trip_constraints", {}) or {}
    weather = state.get("weather_info", {}) or {}
    gateway = gateway_from(config)
    user = f"Trip constraints: {constraints}\nWeather: {weather}\nWrite the day-by-day itinerary."
    with span("node.final"):
        result = await gateway.complete_text(
            node="final",
            system=_SYSTEM,
            user=user,
            mock=_mock_plan(constraints, weather),
        )
    return {
        "itinerary_plan": result.content,
        "messages": [{"role": "assistant", "content": result.content}],
        "llm_calls": [result.as_call_record()],
    }
