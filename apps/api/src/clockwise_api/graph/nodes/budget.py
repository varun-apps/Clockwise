"""Budget specialist — pure LLM synthesis over tool results.

Runs after the parallel specialists converge. Reads flight/hotel results and
constraints, writes ``budget_analysis``. In mock mode it computes deterministic
totals from the cheapest options so offline runs are stable.
"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from ...observability import span
from ...schemas import BudgetAnalysis, FlightOption, HotelOption
from ..state import TravelState
from . import gateway_from

_SYSTEM = (
    "You are the budget agent for a trip planner. Given the flight and hotel "
    "options and trip constraints, produce a realistic budget as JSON with: "
    "currency, flights_total, hotels_total, daily_estimate, grand_total, notes."
)

_DAILY_SPEND = 75.0  # per-day food/local transport estimate


def _cheapest_flight(flights: list[FlightOption]) -> FlightOption | None:
    return min(flights, key=lambda f: f.price) if flights else None


def _cheapest_hotel(hotels: list[HotelOption]) -> HotelOption | None:
    if not hotels:
        return None
    with_total = [h for h in hotels if h.total is not None]
    if with_total:
        return min(with_total, key=lambda h: h.total or 0.0)
    return min(hotels, key=lambda h: h.price_per_night)


def _mock_budget(state: TravelState) -> dict[str, Any]:
    constraints = state.get("trip_constraints")
    days = (constraints.duration_days if constraints else None) or 3
    flights = state.get("flight_results", []) or []
    hotels = state.get("hotel_results", []) or []

    cheap_flight = _cheapest_flight(flights)
    cheap_hotel = _cheapest_hotel(hotels)

    flights_total = cheap_flight.price if cheap_flight else 0.0
    hotels_total = (cheap_hotel.total or 0.0) if cheap_hotel else 0.0
    daily = _DAILY_SPEND
    grand_total = round(flights_total + hotels_total + daily * days, 2)

    return {
        "currency": "USD",
        "flights_total": flights_total,
        "hotels_total": hotels_total,
        "daily_estimate": daily,
        "grand_total": grand_total,
        "notes": f"Based on the cheapest flight and hotel over {days} day(s).",
    }


async def budget_node(state: TravelState, config: RunnableConfig) -> dict[str, Any]:
    gateway = gateway_from(config)
    with span("node.budget"):
        data, call = await gateway.complete_json(
            node="budget",
            system=_SYSTEM,
            user=(
                f"Constraints: {state.get('trip_constraints', {})}\n"
                f"Flights: {state.get('flight_results', [])}\n"
                f"Hotels: {state.get('hotel_results', [])}"
            ),
            mock=_mock_budget(state),
        )
    return {"budget_analysis": BudgetAnalysis(**data), "llm_calls": [call.as_call_record()]}
