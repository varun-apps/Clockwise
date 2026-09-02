"""Graph nodes. Each is model-agnostic and traced; the gateway is injected via
`config["configurable"]["gateway"]` so nodes never construct a client."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from langchain_core.runnables import RunnableConfig

if TYPE_CHECKING:
    from ...llm.gateway import LLMGateway


def gateway_from(config: RunnableConfig) -> LLMGateway:
    configurable = config.get("configurable") or {}
    return cast("LLMGateway", configurable["gateway"])
