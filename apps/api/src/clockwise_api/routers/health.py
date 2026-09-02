"""Health endpoint — also surfaces which mode the app booted in."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:  # noqa: RUF029
    settings = request.app.state.settings
    return HealthResponse(
        env=settings.clockwise_env,
        llm_mode="live" if settings.llm_enabled else "mock",
        langfuse="enabled" if settings.langfuse_enabled else "disabled",
    )
