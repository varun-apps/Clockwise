"""Long-term, cross-conversation memory (Phase 5).

Built on LangGraph's ``BaseStore`` — the same durable, namespaced substrate
LangMem persists into (``InMemoryStore`` locally, ``AsyncPostgresStore`` when a
Postgres URL is configured). Preferences are stored per user under the namespace
``("preferences", user_id)`` and loaded back into ``TravelState`` so a returning
user's tastes shape a new plan without being re-stated.

Extraction is deterministic keyword mapping (so it runs offline and in tests);
the graph's ``save_memory`` node also routes it through the LLM gateway in mock
mode, mirroring LangMem's LLM-driven extraction — swap the deterministic path
for ``langmem``'s store manager when running live.
"""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from langgraph.store.base import BaseStore

# Keyword -> canonical preference statement. Deterministic so it is testable and
# runs with zero LLM calls.
_PREFERENCE_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("beach", "coast", "seaside"), "Enjoys beach days"),
    (("budget", "cheap", "affordable", "low cost"), "Prefers budget-friendly options"),
    (("luxury", "5-star", "five star", "high-end"), "Prefers luxury options"),
    (("museum", "history", "culture", "gallery"), "Interested in museums and culture"),
    (("food", "culinary", "restaurant", "foodie", "cuisine"), "Loves local food"),
    (("hiking", "nature", "outdoors", "trek"), "Enjoys outdoor activities"),
    (("nightlife", "bars", "clubbing"), "Enjoys nightlife"),
    (("family", "kids", "children"), "Traveling with family"),
    (("vegetarian", "vegan"), "Has vegetarian/vegan dietary needs"),
)


def extract_preferences(*texts: str) -> list[str]:
    """Deterministically extract canonical preferences from free text."""
    blob = " ".join(t for t in texts if t).lower()
    found: list[str] = []
    for keywords, statement in _PREFERENCE_RULES:
        if any(k in blob for k in keywords) and statement not in found:
            found.append(statement)
    return found


def _key_for(content: str) -> str:
    """Stable key so re-saving the same preference is idempotent."""
    return hashlib.sha1(content.encode()).hexdigest()[:16]


class MemoryService:
    """Thin wrapper over a LangGraph store, scoped to preferences per user."""

    def __init__(self, store: BaseStore) -> None:
        self._store = store

    @staticmethod
    def _namespace(user_id: str) -> tuple[str, str]:
        return ("preferences", user_id)

    async def load(self, user_id: str) -> list[str]:
        items = await self._store.asearch(self._namespace(user_id))
        return [item.value["content"] for item in items if "content" in item.value]

    async def save(self, user_id: str, preferences: list[str]) -> list[str]:
        """Persist new preferences; returns the ones actually added."""
        ns = self._namespace(user_id)
        existing = set(await self.load(user_id))
        added: list[str] = []
        for pref in preferences:
            if pref in existing:
                continue
            await self._store.aput(ns, key=_key_for(pref), value={"content": pref})
            existing.add(pref)
            added.append(pref)
        return added
