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
PlanStatus = Literal["completed", "blocked", "awaiting_review"]
ReviewAction = Literal["approve", "request_changes"]


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


class FlightOption(BaseModel):
    airline: str
    flight_number: str
    origin: str
    destination: str
    depart_time: str | None = None
    price: float
    currency: str = "USD"
    duration: str | None = None


class HotelOption(BaseModel):
    name: str
    area: str | None = None
    rating: float | None = None
    price_per_night: float
    currency: str = "USD"
    nights: int | None = None
    total: float | None = None


class BudgetAnalysis(BaseModel):
    currency: str = "USD"
    flights_total: float | None = None
    hotels_total: float | None = None
    daily_estimate: float | None = None
    grand_total: float | None = None
    notes: str | None = None


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


class ResumeRequest(BaseModel):
    conversation_id: uuid.UUID = Field(description="The paused conversation to resume")
    action: ReviewAction = Field(description="approve the itinerary or request changes")
    feedback: str | None = Field(
        default=None, description="What to change (used when action is request_changes)"
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
    flights: list[FlightOption] = Field(default_factory=list)
    hotels: list[HotelOption] = Field(default_factory=list)
    budget: BudgetAnalysis | None = None
    itinerary_plan: str | None = None
    summary: str | None = None
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
