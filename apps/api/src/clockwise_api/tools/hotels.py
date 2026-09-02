"""In-process hotel tool.

Mock-first: without ``TAVILY_KEY`` it serves frozen fixtures keyed by
destination. With a key it runs a Tavily search, falling back to fixtures on
any error. Computes per-stay totals from the number of nights.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..config import get_settings
from ..logging import get_logger

log = get_logger(__name__)

_FIXTURE = Path(__file__).parent / "fixtures" / "hotels.json"


@lru_cache
def _fixtures() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(_FIXTURE.read_text())
    return data


def _finalize(options: list[dict[str, Any]], nights: int) -> list[dict[str, Any]]:
    result = []
    for o in options:
        entry = dict(o)
        entry["nights"] = nights
        entry["total"] = round(entry["price_per_night"] * nights, 2)
        result.append(entry)
    return result


def get_hotels(destination: str | None, nights: int | None) -> list[dict[str, Any]]:
    """Return normalized hotel options (list of dicts matching HotelOption)."""
    destination = (destination or "your destination").strip()
    nights = nights or 3

    settings = get_settings()
    data = _fixtures()
    fixture_options = data.get(destination.lower(), data["default"])

    if not settings.tavily_key:
        return _finalize(fixture_options, nights)

    try:
        import httpx

        resp = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": settings.tavily_key,
                "query": f"best hotels in {destination}",
                "max_results": 3,
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        # Tavily returns search hits, not structured pricing; use fixture prices
        # as a stand-in and label with the real hotel names when available.
        options = [
            {
                "name": hit.get("title", fixture_options[i % len(fixture_options)]["name"]),
                "area": None,
                "rating": None,
                "price_per_night": fixture_options[i % len(fixture_options)]["price_per_night"],
                "currency": "USD",
            }
            for i, hit in enumerate(results[:3])
        ]
        return _finalize(options or fixture_options, nights)
    except Exception as exc:  # pragma: no cover - network path
        log.warning("hotels.live_failed", error=str(exc))
        return _finalize(fixture_options, nights)
