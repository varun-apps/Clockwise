"""In-process weather tool.

Mock-first: without a weather API key it serves frozen fixtures keyed by
destination (falling back to a generic entry). This is the pattern every
Phase 3 tool follows — swap the fixture branch for a real HTTP call guarded by
its key.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_FIXTURE = Path(__file__).parent / "fixtures" / "weather.json"


@lru_cache
def _fixtures() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(_FIXTURE.read_text())
    return data


def get_weather(destination: str | None) -> dict[str, Any]:
    """Return normalized weather for a destination.

    Returns a dict with keys: destination, summary, avg_high_c, avg_low_c,
    conditions — matching `schemas.WeatherInfo`.
    """
    dest = (destination or "your destination").strip()
    key = dest.lower()
    data = _fixtures()
    entry = data.get(key, data["default"])
    return {
        "destination": dest,
        "summary": entry["summary"],
        "avg_high_c": entry.get("avg_high_c"),
        "avg_low_c": entry.get("avg_low_c"),
        "conditions": entry.get("conditions", []),
    }
