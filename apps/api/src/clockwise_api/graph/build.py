r"""Assemble the LangGraph orchestration graph.

    START -> guardrail -(PASS)-> supervisor -(fan-out)-> [flight|hotel|weather]
                       \-(BLOCK)-> END          (parallel)        |
                                                                  v
                                        END <- final <- itinerary <- budget

The supervisor conditionally fans out to the selected tool specialists, which
run in parallel and merge into TravelState; budget is the fan-in convergence
node, then itinerary drafts the reviewable plan and final summarizes.

Compiled with a checkpointer (Postgres in prod, in-memory in tests). The
checkpointer is foundational, not optional: it is what makes Phase 4's HITL
`interrupt()`/resume possible and gives resumability + time-travel today.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langgraph.graph import END, START, StateGraph

from .nodes.budget import budget_node
from .nodes.final import final_node
from .nodes.flight import flight_node
from .nodes.guardrail import guardrail_node, route_after_guardrail
from .nodes.hotel import hotel_node
from .nodes.itinerary import itinerary_node
from .nodes.supervisor import route_to_specialists, supervisor_node
from .nodes.weather import weather_node
from .state import TravelState

if TYPE_CHECKING:
    from langgraph.checkpoint.base import BaseCheckpointSaver
    from langgraph.graph.state import CompiledStateGraph

# Tool specialists that fan out in parallel and fan back in to budget.
_SPECIALISTS = ("flight", "hotel", "weather")


def build_graph(checkpointer: BaseCheckpointSaver[Any]) -> CompiledStateGraph[Any, Any, Any]:
    builder = StateGraph(TravelState)

    builder.add_node("guardrail", guardrail_node)
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("flight", flight_node)
    builder.add_node("hotel", hotel_node)
    builder.add_node("weather", weather_node)
    builder.add_node("budget", budget_node)
    builder.add_node("itinerary", itinerary_node)
    builder.add_node("final", final_node)

    builder.add_edge(START, "guardrail")
    builder.add_conditional_edges(
        "guardrail",
        route_after_guardrail,
        {"supervisor": "supervisor", "__end__": END},
    )
    # Conditional fan-out: schedule only the selected specialists (in parallel).
    builder.add_conditional_edges(
        "supervisor",
        route_to_specialists,
        {"flight": "flight", "hotel": "hotel", "weather": "weather", "budget": "budget"},
    )
    # Fan-in: budget runs once after the scheduled specialists converge.
    for specialist in _SPECIALISTS:
        builder.add_edge(specialist, "budget")
    builder.add_edge("budget", "itinerary")
    builder.add_edge("itinerary", "final")
    builder.add_edge("final", END)

    return builder.compile(checkpointer=checkpointer)
