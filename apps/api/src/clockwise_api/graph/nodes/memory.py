"""Memory nodes: load preferences before planning, save them after.

``load_memory`` runs right after the guardrail passes and pulls the user's
stored preferences into ``memory_context`` so the supervisor and itinerary can
personalize. ``save_memory`` runs after ``final`` and extracts preferences from
this conversation (query + any revision feedback) and persists them for next
time. Extraction is deterministic (offline) but routed through the gateway so it
records an LLM call and can be swapped for LangMem's LLM extractor when live.
"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from ...memory import extract_preferences
from ...observability import span
from ..state import TravelState
from . import gateway_from, memory_from


async def load_memory_node(state: TravelState, config: RunnableConfig) -> dict[str, Any]:
    user_id = state.get("user_id", "anonymous")
    memory = memory_from(config)
    with span("node.load_memory"):
        prefs = await memory.load(user_id)
    return {"memory_context": prefs}


async def save_memory_node(state: TravelState, config: RunnableConfig) -> dict[str, Any]:
    user_id = state.get("user_id", "anonymous")
    memory = memory_from(config)
    gateway = gateway_from(config)

    constraints = state.get("trip_constraints")
    notes = constraints.notes if constraints else None
    sources = [
        state.get("user_query", ""),
        state.get("revision_feedback", ""),
        str(notes or ""),
    ]
    deterministic = extract_preferences(*sources)

    with span("node.save_memory"):
        # Route through the gateway (mock returns the deterministic set) so the
        # extraction shows as an LLM step and can be swapped for a live extractor.
        data, call = await gateway.complete_json(
            node="memory",
            system=(
                "Extract durable traveler preferences (as short statements) from "
                'the conversation. Respond as JSON: {"preferences": [..]}.'
            ),
            user=" | ".join(s for s in sources if s),
            mock={"preferences": deterministic},
        )
        prefs = data.get("preferences", deterministic)
        added = await memory.save(user_id, prefs)

    return {"memory_saved": added, "llm_calls": [call.as_call_record()]}
