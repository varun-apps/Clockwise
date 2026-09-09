r"""Assemble the LangGraph orchestration graph.

    START -> guardrail -(PASS)-> load_memory -> supervisor -(fan-out)-> [flight|hotel|weather]
                       \-(BLOCK)-> END                       (parallel)        |
                                                                               v
       END <- save_memory <- final <-(approve)- human_review <- itinerary <- budget
                                         |                          ^
                                         \--(request_changes)-------/

load_memory pulls the user's saved preferences into state; the supervisor fans
out to the selected tool specialists (parallel), budget is the fan-in, itinerary
drafts the reviewable (personalized) plan. human_review interrupt()s for
approval: approve -> final, request_changes -> loop back to itinerary. After
final, save_memory persists preferences learned this run.

Compiled with a checkpointer (HITL resume + time-travel) and a store (LangMem-
style long-term memory) — Postgres in prod, in-memory otherwise.
"""

from __future__ import annotations

from collections.abc import Hashable
from typing import TYPE_CHECKING, Any

from langgraph.graph import END, START, StateGraph

from ..specialists import TOOL_SPECIALISTS
from .nodes.budget import budget_node
from .nodes.final import final_node
from .nodes.flight import flight_node
from .nodes.guardrail import guardrail_node, route_after_guardrail
from .nodes.hotel import hotel_node
from .nodes.human_review import human_review_node, route_after_review
from .nodes.itinerary import itinerary_node
from .nodes.memory import load_memory_node, save_memory_node
from .nodes.supervisor import route_to_specialists, supervisor_node
from .nodes.weather import weather_node
from .state import TravelState

if TYPE_CHECKING:
    from langgraph.checkpoint.base import BaseCheckpointSaver
    from langgraph.graph.state import CompiledStateGraph
    from langgraph.store.base import BaseStore

# Fan-out edges: each tool specialist routes to itself; when none is selected the
# fallback routes straight to budget (the fan-in convergence node).
_FANOUT_EDGES: dict[Hashable, str] = {}
for name in TOOL_SPECIALISTS:
    _FANOUT_EDGES[name] = name
_FANOUT_EDGES["budget"] = "budget"


def build_graph(
    checkpointer: BaseCheckpointSaver[Any],
    store: BaseStore | None = None,
) -> CompiledStateGraph[Any, Any, Any]:
    builder = StateGraph(TravelState)

    builder.add_node("guardrail", guardrail_node)
    builder.add_node("load_memory", load_memory_node)
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("flight", flight_node)
    builder.add_node("hotel", hotel_node)
    builder.add_node("weather", weather_node)
    builder.add_node("budget", budget_node)
    builder.add_node("itinerary", itinerary_node)
    builder.add_node("human_review", human_review_node)
    builder.add_node("final", final_node)
    builder.add_node("save_memory", save_memory_node)

    builder.add_edge(START, "guardrail")
    # PASS -> load the user's long-term preferences, then plan.
    builder.add_conditional_edges(
        "guardrail",
        route_after_guardrail,
        {"load_memory": "load_memory", "__end__": END},
    )
    builder.add_edge("load_memory", "supervisor")
    # Conditional fan-out: schedule only the selected specialists (in parallel).
    builder.add_conditional_edges(
        "supervisor",
        route_to_specialists,
        _FANOUT_EDGES,
    )
    # Fan-in: budget runs once after the scheduled specialists converge.
    for specialist in TOOL_SPECIALISTS:
        builder.add_edge(specialist, "budget")
    builder.add_edge("budget", "itinerary")
    builder.add_edge("itinerary", "human_review")
    # HITL: approve -> final; request_changes -> re-draft the itinerary.
    builder.add_conditional_edges(
        "human_review",
        route_after_review,
        {"final": "final", "itinerary": "itinerary"},
    )
    # After the plan is approved, persist preferences learned this run.
    builder.add_edge("final", "save_memory")
    builder.add_edge("save_memory", END)

    return builder.compile(checkpointer=checkpointer, store=store)
