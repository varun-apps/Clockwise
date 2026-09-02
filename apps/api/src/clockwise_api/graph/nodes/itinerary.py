"""Itinerary specialist — pure LLM synthesis of the reviewable day-wise plan.

Reads nearly everything (constraints, weather, hotels, budget) and writes
``itinerary_plan``. This is the node a future HITL interrupt (Phase 4) pauses
after for human review.
"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from ...observability import span
from ..state import TravelState
from . import gateway_from

_SYSTEM = (
    "You are the itinerary agent. Using the trip constraints, weather, chosen "
    "hotel, and budget, write a concise day-by-day itinerary in Markdown. Be "
    "practical and reference the weather and the neighborhood of the hotel."
)


def _mock_plan(state: TravelState) -> str:
    constraints = state.get("trip_constraints", {}) or {}
    weather = state.get("weather_info", {}) or {}
    hotels = state.get("hotel_results", []) or []
    destination = constraints.get("destination") or "your destination"
    days = int(constraints.get("duration_days") or 3)

    hotel = hotels[0] if hotels else None
    feedback = state.get("revision_feedback")
    prefs = state.get("memory_context", []) or []
    lines = [f"# {days}-Day Trip to {destination}", ""]
    if feedback:
        lines.append(f"_Revised per your feedback: {feedback}_")
        lines.append("")
    if prefs:
        lines.append(f"_Personalized from your saved preferences: {', '.join(prefs)}._")
        lines.append("")
    if weather:
        lines.append(
            f"_Weather: {weather.get('summary', 'n/a')} "
            f"(avg {weather.get('avg_low_c', '?')}–{weather.get('avg_high_c', '?')}°C)_"
        )
    if hotel:
        lines.append(f"_Staying at {hotel['name']} ({hotel.get('area', 'central')})._")
    lines.append("")

    # Preferences shape the actual days, not just a header.
    likes_beach = any("beach" in p.lower() for p in prefs)
    for day in range(1, days + 1):
        if day == 1:
            lines.append(f"**Day {day}.** Arrive, check in, and explore near the hotel on foot.")
        elif likes_beach and day == 2:
            lines.append(f"**Day {day}.** Beach day — relax by the coast (per your preferences).")
        elif day == days:
            lines.append(f"**Day {day}.** Relaxed morning, souvenirs, and departure.")
        else:
            lines.append(f"**Day {day}.** Key sights and a local meal; adjust for weather.")
    return "\n".join(lines)


async def itinerary_node(state: TravelState, config: RunnableConfig) -> dict[str, Any]:
    gateway = gateway_from(config)
    with span("node.itinerary"):
        result = await gateway.complete_text(
            node="itinerary",
            system=_SYSTEM,
            user=(
                f"Constraints: {state.get('trip_constraints', {})}\n"
                f"Weather: {state.get('weather_info', {})}\n"
                f"Hotels: {state.get('hotel_results', [])}\n"
                f"Budget: {state.get('budget_analysis', {})}\n"
                f"Saved traveler preferences (apply): {state.get('memory_context', [])}\n"
                f"Revision feedback (apply if present): {state.get('revision_feedback', '')}"
            ),
            mock=_mock_plan(state),
        )
    return {
        "itinerary_plan": result.content,
        "messages": [{"role": "assistant", "content": result.content}],
        "llm_calls": [result.as_call_record()],
    }
