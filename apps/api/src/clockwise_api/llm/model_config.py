"""Single source of truth mapping each graph node to a model id.

Node code stays model-agnostic: a node asks `model_for(node)` and never names a
model itself. Which nodes sit in the (stronger) synthesis tier is declared in
`specialists.py`; the model ids here are the seam the Phase 7 eval flips.
"""

from __future__ import annotations

from ..config import Settings
from ..specialists import SYNTHESIS_SPECIALISTS


def model_for(node: str, settings: Settings) -> str:
    """Return the model id configured for a node."""
    if node in SYNTHESIS_SPECIALISTS:
        return settings.clockwise_model_synthesis
    return settings.clockwise_model_default
