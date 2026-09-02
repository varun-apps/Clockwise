"""Single source of truth mapping each graph node to a model id.

Node code stays model-agnostic: a node asks `model_for(node)` and never names a
model itself. Tiering (e.g. a stronger synthesis model) is a one-line change
here and nowhere else — this is the seam the Phase 7 eval experiment flips.
"""

from __future__ import annotations

from ..config import Settings

# Synthesis nodes are the LLM reasoning steps the Phase 7 eval may promote to a
# stronger tier. Tool-calling nodes (flight/hotel/weather) don't call the LLM.
_SYNTHESIS_NODES = {"budget", "itinerary", "final"}


def model_for(node: str, settings: Settings) -> str:
    """Return the model id configured for a node."""
    if node in _SYNTHESIS_NODES:
        return settings.clockwise_model_synthesis
    return settings.clockwise_model_default
