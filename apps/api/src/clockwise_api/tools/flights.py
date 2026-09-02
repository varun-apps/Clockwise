"""In-process flight tool.

Mock-first: without ``AVIATIONSTACK_KEY`` it serves frozen fixtures keyed by
destination. With a key it queries AviationStack, falling back to fixtures on
any error so the graph never hard-fails on a flaky upstream.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..config import get_settings
from ..logging import get_logger

log = get_logger(__name__)

_FIXTURE = Path(__file__).parent / "fixtures" / "flights.json"


@lru_cache
def _fixtures() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(_FIXTURE.read_text())
    return data


def _from_fixture(origin: str, destination: str) -> list[dict[str, Any]]:
    data = _fixtures()
    options = data.get(destination.lower(), data["default"])
    return [{**o, "origin": origin, "destination": destination} for o in options]


def get_flights(origin: str | None, destination: str | None) -> list[dict[str, Any]]:
    """Return normalized flight options (list of dicts matching FlightOption)."""
    origin = (origin or "Origin").strip()
    destination = (destination or "your destination").strip()

    settings = get_settings()
    if not settings.aviationstack_key:
        return _from_fixture(origin, destination)

    try:
        import httpx

        resp = httpx.get(
            "http://api.aviationstack.com/v1/flights",
            params={"access_key": settings.aviationstack_key, "limit": 3},
            timeout=10.0,
        )
        resp.raise_for_status()
        raw = resp.json().get("data", [])
        options = [
            {
                "airline": item.get("airline", {}).get("name", "Unknown"),
                "flight_number": item.get("flight", {}).get("iata", "—"),
                "origin": origin,
                "destination": destination,
                "depart_time": item.get("departure", {}).get("scheduled"),
                "price": 0.0,  # AviationStack has no pricing; enrich elsewhere.
                "currency": "USD",
                "duration": None,
            }
            for item in raw[:3]
        ]
        return options or _from_fixture(origin, destination)
    except Exception as exc:  # pragma: no cover - network path
        log.warning("flights.live_failed", error=str(exc))
        return _from_fixture(origin, destination)
