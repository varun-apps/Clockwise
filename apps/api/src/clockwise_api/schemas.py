"""Pydantic API models — the single source of truth for the OpenAPI schema.

These types are emitted to `openapi.json` and codegen'd into the frontend's
typed client (`task codegen`). Renaming a field here breaks the FE type-check.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AgentName = Literal["flight", "hotel", "weather", "budget", "itinerary"]
PlanStatus = Literal["completed", "blocked"]


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    env: str
    llm_mode: Literal["live", "mock"]
    langfuse: Literal["enabled", "disabled"]


class TripConstraints(BaseModel):
    destination: str | None = None
    origin: str | None = None
    duration_days: int | None = None
    start_date: str | None = None
    travelers: int | None = None
    budget: float | None = None
    notes: str | None = None


class WeatherInfo(BaseModel):
    destination: str
    summary: str
    avg_high_c: float | None = None
    avg_low_c: float | None = None
    conditions: list[str] = Field(default_factory=list)


class LLMCall(BaseModel):
    node: str
    model: str
    mocked: bool
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


class PlanRequest(BaseModel):
    query: str = Field(min_length=1, description="Free-text trip request")
    conversation_id: uuid.UUID | None = Field(
        default=None, description="Continue an existing conversation, or omit to start one"
    )


class PlanResponse(BaseModel):
    conversation_id: uuid.UUID
    thread_id: str
    status: PlanStatus
    blocked_reason: str | None = None
    reasoning: str | None = None
    selected_agents: list[AgentName] = Field(default_factory=list)
    trip_constraints: TripConstraints | None = None
    weather: WeatherInfo | None = None
    itinerary_plan: str | None = None
    llm_calls: list[LLMCall] = Field(default_factory=list)


class MessageRead(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class ConversationRead(BaseModel):
    id: uuid.UUID
    thread_id: str
    title: str | None
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationRead):
    messages: list[MessageRead] = Field(default_factory=list)
