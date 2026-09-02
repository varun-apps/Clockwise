"""Test fixtures. Forces offline mode (no keys) and a file-backed SQLite DB so
the full stack runs with zero external dependencies."""

from __future__ import annotations

import os
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio

# Configure environment BEFORE importing the app.
_DB_FILE = Path(tempfile.gettempdir()) / "clockwise_test.db"
_DB_FILE.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_FILE}"
os.environ["OPENROUTER_API_KEY"] = ""
os.environ["LANGFUSE_PUBLIC_KEY"] = ""
os.environ["LANGFUSE_SECRET_KEY"] = ""
os.environ["CLOCKWISE_ENV"] = "test"


@pytest_asyncio.fixture
async def app() -> AsyncIterator[object]:
    from clockwise_api.config import get_settings
    from clockwise_api.main import create_app

    get_settings.cache_clear()
    application = create_app()
    async with application.router.lifespan_context(application):
        yield application


@pytest_asyncio.fixture
async def client(app: object):  # type: ignore[no-untyped-def]
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def offline_settings():  # type: ignore[no-untyped-def]
    from clockwise_api.config import Settings

    return Settings(
        openrouter_api_key=None,
        database_url="sqlite+aiosqlite:///:memory:",
    )
