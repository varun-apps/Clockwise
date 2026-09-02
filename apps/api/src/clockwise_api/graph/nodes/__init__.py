"""Graph nodes. Each is model-agnostic and traced; the gateway is injected via
`config["configurable"]["gateway"]` so nodes never construct a client."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from langchain_core.runnables import RunnableConfig

if TYPE_CHECKING:
    from ...llm.gateway import LLMGateway
    from ...memory import MemoryService


def gateway_from(config: RunnableConfig) -> LLMGateway:
    configurable = config.get("configurable") or {}
    return cast("LLMGateway", configurable["gateway"])


def memory_from(config: RunnableConfig) -> MemoryService:
    configurable = config.get("configurable") or {}
    return cast("MemoryService", configurable["memory"])
