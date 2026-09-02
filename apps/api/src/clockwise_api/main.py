"""FastAPI application factory + lifespan.

Lifespan wires the three infra pieces before any request: the async DB, the
LangGraph checkpointer (Postgres in prod, in-memory otherwise), and Langfuse.
The compiled graph and the LLM gateway are stored on `app.state`.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from typing import TYPE_CHECKING, Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .db import get_engine
from .graph.build import build_graph
from .llm.gateway import LLMGateway
from .logging import configure_logging, get_logger
from .memory import MemoryService
from .models import Base
from .observability import flush, init_observability
from .routers import conversations, health, plan

if TYPE_CHECKING:
    from langgraph.checkpoint.base import BaseCheckpointSaver
    from langgraph.store.base import BaseStore

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.clockwise_log_level)
    init_observability(settings)

    stack = AsyncExitStack()

    # Dev/test convenience: create tables for SQLite; Postgres uses Alembic.
    if settings.db_url_async.startswith("sqlite"):
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    # Checkpointer (HITL resume) + store (long-term memory): Postgres when
    # configured, else in-memory — no hard Postgres dependency for local/mock.
    checkpointer: BaseCheckpointSaver[Any]
    store: BaseStore
    if settings.db_url_async.startswith("postgresql"):
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from langgraph.store.postgres.aio import AsyncPostgresStore

        conn_str = settings.database_url.replace("postgresql+psycopg://", "postgresql://", 1)
        pg = await stack.enter_async_context(AsyncPostgresSaver.from_conn_string(conn_str))
        await pg.setup()
        checkpointer = pg
        pg_store = await stack.enter_async_context(AsyncPostgresStore.from_conn_string(conn_str))
        await pg_store.setup()
        store = pg_store
    else:
        from langgraph.checkpoint.memory import InMemorySaver
        from langgraph.store.memory import InMemoryStore

        checkpointer = InMemorySaver()
        store = InMemoryStore()

    app.state.settings = settings
    app.state.gateway = LLMGateway(settings)
    app.state.memory = MemoryService(store)
    app.state.graph = build_graph(checkpointer, store)
    log.info("startup.ready", llm="live" if settings.llm_enabled else "mock")

    try:
        yield
    finally:
        flush()
        await stack.aclose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="ClockWise API", version="0.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:  # noqa: RUF029
        log.error("unhandled_error", path=str(request.url), error=str(exc))
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    app.include_router(health.router)
    app.include_router(conversations.router)
    app.include_router(plan.router)
    return app


app = create_app()


def custom_openapi() -> dict[str, Any]:  # re-export helper for openapi_export
    return app.openapi()
