"""POST /plan and POST /plan/resume — run the orchestration graph.

`/plan` runs the graph under a single Langfuse span keyed by the conversation's
thread_id. The graph interrupts at human review; when it does, `/plan` returns
`status="awaiting_review"` with the draft itinerary and the connection closes —
no worker is held. `/plan/resume` rehydrates from the checkpoint (by thread_id)
and continues with the traveler's decision. A guardrail BLOCK short-circuits to
`status="blocked"`.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Conversation, Message
from ..observability import span
from ..schemas import (
    BudgetAnalysis,
    FlightOption,
    HotelOption,
    LLMCall,
    PlanRequest,
    PlanResponse,
    ResumeRequest,
    TripConstraints,
    WeatherInfo,
)

router = APIRouter(tags=["plan"])


async def _get_or_create_conversation(
    session: AsyncSession, conversation_id: uuid.UUID | None, query: str
) -> Conversation:
    if conversation_id is not None:
        convo = await session.scalar(select(Conversation).where(Conversation.id == conversation_id))
        if convo is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return convo
    new_id = uuid.uuid4()
    convo = Conversation(id=new_id, thread_id=str(new_id), title=query[:80])
    session.add(convo)
    await session.flush()
    return convo


def _completed_response(convo: Conversation, state: dict[str, Any]) -> PlanResponse:
    constraints_raw = state.get("trip_constraints")
    weather_raw = state.get("weather_info")
    budget_raw = state.get("budget_analysis")
    return PlanResponse(
        conversation_id=convo.id,
        thread_id=convo.thread_id,
        status="completed",
        reasoning=state.get("reasoning"),
        selected_agents=state.get("selected_agents", []),
        trip_constraints=TripConstraints(**constraints_raw) if constraints_raw else None,
        weather=WeatherInfo(**weather_raw) if weather_raw else None,
        flights=[FlightOption(**f) for f in state.get("flight_results", []) or []],
        hotels=[HotelOption(**h) for h in state.get("hotel_results", []) or []],
        budget=BudgetAnalysis(**budget_raw) if budget_raw else None,
        itinerary_plan=state.get("itinerary_plan"),
        summary=state.get("summary"),
        llm_calls=[LLMCall(**c) for c in state.get("llm_calls", [])],
    )


def _awaiting_review_response(convo: Conversation, state: dict[str, Any]) -> PlanResponse:
    """Same payload as completed, but status=awaiting_review and no summary yet."""
    resp = _completed_response(convo, state)
    resp.status = "awaiting_review"
    resp.summary = None
    return resp


@router.post("/plan", response_model=PlanResponse)
async def plan(
    body: PlanRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> PlanResponse:
    graph = request.app.state.graph
    gateway = request.app.state.gateway

    convo = await _get_or_create_conversation(session, body.conversation_id, body.query)
    session.add(Message(conversation_id=convo.id, role="user", content=body.query))

    config = {"configurable": {"thread_id": convo.thread_id, "gateway": gateway}}
    with span("clockwise.plan", thread_id=convo.thread_id):
        state = await graph.ainvoke(
            {"user_query": body.query, "messages": [{"role": "user", "content": body.query}]},
            config,
        )

    guardrail = state.get("guardrail", {})
    if guardrail.get("decision") == "BLOCK":
        reason = guardrail.get("reason", "Request blocked.")
        session.add(Message(conversation_id=convo.id, role="assistant", content=reason))
        await session.commit()
        return PlanResponse(
            conversation_id=convo.id,
            thread_id=convo.thread_id,
            status="blocked",
            blocked_reason=reason,
            llm_calls=[LLMCall(**c) for c in state.get("llm_calls", [])],
        )

    # Paused at human review: persist the draft and return for approval.
    if "__interrupt__" in state:
        draft = state.get("itinerary_plan")
        if draft:
            session.add(Message(conversation_id=convo.id, role="assistant", content=draft))
        await session.commit()
        return _awaiting_review_response(convo, state)

    summary = state.get("summary") or state.get("itinerary_plan")
    if summary:
        session.add(Message(conversation_id=convo.id, role="assistant", content=summary))
    await session.commit()
    return _completed_response(convo, state)


@router.post("/plan/resume", response_model=PlanResponse)
async def resume(
    body: ResumeRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> PlanResponse:
    graph = request.app.state.graph
    gateway = request.app.state.gateway

    convo = await session.scalar(
        select(Conversation).where(Conversation.id == body.conversation_id)
    )
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    config = {"configurable": {"thread_id": convo.thread_id, "gateway": gateway}}

    # Only resume a conversation that is actually paused at review.
    snapshot = await graph.aget_state(config)
    if "human_review" not in (snapshot.next or ()):
        raise HTTPException(status_code=409, detail="Conversation is not awaiting review")

    decision: dict[str, Any] = {"action": body.action}
    if body.action == "request_changes":
        decision["feedback"] = body.feedback or ""
        session.add(
            Message(
                conversation_id=convo.id,
                role="user",
                content=f"[request changes] {body.feedback or ''}".strip(),
            )
        )

    with span("clockwise.resume", thread_id=convo.thread_id):
        state = await graph.ainvoke(Command(resume=decision), config)

    # request_changes loops back through itinerary and pauses again.
    if "__interrupt__" in state:
        draft = state.get("itinerary_plan")
        if draft:
            session.add(Message(conversation_id=convo.id, role="assistant", content=draft))
        await session.commit()
        return _awaiting_review_response(convo, state)

    summary = state.get("summary") or state.get("itinerary_plan")
    if summary:
        session.add(Message(conversation_id=convo.id, role="assistant", content=summary))
    await session.commit()
    return _completed_response(convo, state)
