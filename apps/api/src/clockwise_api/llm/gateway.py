"""OpenAI-compatible LLM gateway.

One client for every node. Each call goes through `model_for(node)` so the
model is chosen centrally. When no API key is configured the gateway returns
the caller-supplied `mock` value verbatim, letting the whole graph run offline
and deterministically (which is also what the eval harness needs).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from ..config import Settings
from ..logging import get_logger
from ..observability import span
from .model_config import model_for

log = get_logger(__name__)


@dataclass
class LLMResult:
    """A gateway response plus the metadata recorded into TravelState.llm_calls."""

    content: str
    node: str
    model: str
    mocked: bool
    prompt_tokens: int | None = None
    completion_tokens: int | None = None

    def as_call_record(self) -> dict[str, Any]:
        return {
            "node": self.node,
            "model": self.model,
            "mocked": self.mocked,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
        }


class LLMGateway:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: Any | None = None
        if settings.llm_enabled:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(
                api_key=settings.openrouter_api_key,
                base_url=settings.openrouter_base_url,
            )

    @property
    def live(self) -> bool:
        return self._client is not None

    async def complete_text(self, *, node: str, system: str, user: str, mock: str) -> LLMResult:
        model = model_for(node, self._settings)
        with span(f"llm.{node}", model=model, mocked=not self.live):
            if self._client is None:
                return LLMResult(content=mock, node=node, model=model, mocked=True)
            resp = await self._client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            usage = resp.usage
            return LLMResult(
                content=resp.choices[0].message.content or "",
                node=node,
                model=model,
                mocked=False,
                prompt_tokens=getattr(usage, "prompt_tokens", None),
                completion_tokens=getattr(usage, "completion_tokens", None),
            )

    async def complete_json(
        self, *, node: str, system: str, user: str, mock: dict[str, Any]
    ) -> tuple[dict[str, Any], LLMResult]:
        model = model_for(node, self._settings)
        with span(f"llm.{node}", model=model, mocked=not self.live):
            if self._client is None:
                return mock, LLMResult(
                    content=json.dumps(mock), node=node, model=model, mocked=True
                )
            resp = await self._client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format={"type": "json_object"},
            )
            raw = resp.choices[0].message.content or "{}"
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                log.warning("gateway.json_parse_failed", node=node, raw=raw[:200])
                data = mock
            usage = resp.usage
            result = LLMResult(
                content=raw,
                node=node,
                model=model,
                mocked=False,
                prompt_tokens=getattr(usage, "prompt_tokens", None),
                completion_tokens=getattr(usage, "completion_tokens", None),
            )
            return data, result
