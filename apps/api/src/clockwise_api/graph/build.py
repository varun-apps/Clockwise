"""Assemble the LangGraph orchestration graph.

    START -> guardrail -(PASS)-> supervisor -> weather -> final -> END
                       \-(BLOCK)-> END

Compiled with a checkpointer (Postgres in prod, in-memory in tests). The
checkpointer is foundational, not optional: it is what makes Phase 4's HITL
`interrupt()`/resume possible and gives resumability + time-travel today.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langgraph.graph import END, START, StateGraph

from .nodes.final import final_node
from .nodes.guardrail import guardrail_node, route_after_guardrail
from .nodes.supervisor import supervisor_node
from .nodes.weather import weather_node
from .state import TravelState

if TYPE_CHECKING:
    from langgraph.checkpoint.base import BaseCheckpointSaver
    from langgraph.graph.state import CompiledStateGraph


def build_graph(checkpointer: BaseCheckpointSaver[Any]) -> CompiledStateGraph[Any, Any, Any]:
    builder = StateGraph(TravelState)

    builder.add_node("guardrail", guardrail_node)
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("weather", weather_node)
    builder.add_node("final", final_node)

    builder.add_edge(START, "guardrail")
    builder.add_conditional_edges(
        "guardrail",
        route_after_guardrail,
        {"supervisor": "supervisor", "__end__": END},
    )
    builder.add_edge("supervisor", "weather")
    builder.add_edge("weather", "final")
    builder.add_edge("final", END)

    return builder.compile(checkpointer=checkpointer)
