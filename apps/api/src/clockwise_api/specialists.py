"""Specialist registry — single source of truth for the graph's specialists.

The supervisor's fan-out, the graph's edges, and the model tiering all derive
from these two lists so they can't drift independently. Tool specialists run in
parallel fan-out and call an in-process tool (no LLM); synthesis specialists are
the LLM reasoning steps over the tool results.
"""

from __future__ import annotations

# Tool specialists: parallel fan-out, in-process tool, no LLM.
TOOL_SPECIALISTS: tuple[str, ...] = ("flight", "hotel", "weather")

# Synthesis specialists: LLM reasoning over the tool results.
SYNTHESIS_SPECIALISTS: tuple[str, ...] = ("budget", "itinerary", "final")
