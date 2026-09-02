"""Langfuse tracing, baked in from day one.

When Langfuse is not configured the `span()` helper is a no-op context manager,
so nodes and the gateway can wrap every step unconditionally. With keys present,
nested `span()` calls form a single parent/child trace per request.
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterator
from typing import Any

from .config import Settings
from .logging import get_logger

log = get_logger(__name__)

_client: Any | None = None


def init_observability(settings: Settings) -> None:
    global _client
    if not settings.langfuse_enabled:
        log.info("langfuse.disabled", reason="missing keys; tracing is a no-op")
        _client = None
        return
    try:
        from langfuse import Langfuse

        _client = Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
        log.info("langfuse.enabled", host=settings.langfuse_host)
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("langfuse.init_failed", error=str(exc))
        _client = None


@contextlib.contextmanager
def span(name: str, **attributes: Any) -> Iterator[Any]:
    """Open a Langfuse span, or a no-op if tracing is disabled."""
    if _client is None:
        yield None
        return
    with _client.start_as_current_span(name=name) as current:
        if attributes:
            with contextlib.suppress(Exception):
                current.update(metadata=attributes)
        yield current


def flush() -> None:
    if _client is not None:
        with contextlib.suppress(Exception):
            _client.flush()
