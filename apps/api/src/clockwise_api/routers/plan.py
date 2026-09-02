"""POST /plan — run the orchestration graph end-to-end.

Creates (or continues) a conversation, runs the graph under a single Langfuse
span keyed by the conversation's thread_id, persists the exchange, and returns
the thin plan. A guardrail BLOCK short-circuits to a `blocked` response.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Conversation, Message
from ..observability import span
from ..schemas import (
    LLMCall,
    PlanRequest,
    PlanResponse,
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
    llm_calls = [LLMCall(**c) for c in state.get("llm_calls", [])]

    if guardrail.get("decision") == "BLOCK":
        reason = guardrail.get("reason", "Request blocked.")
        session.add(Message(conversation_id=convo.id, role="assistant", content=reason))
        await session.commit()
        return PlanResponse(
            conversation_id=convo.id,
            thread_id=convo.thread_id,
            status="blocked",
            blocked_reason=reason,
            llm_calls=llm_calls,
        )

    itinerary = state.get("itinerary_plan")
    weather_raw = state.get("weather_info")
    constraints_raw = state.get("trip_constraints")
    if itinerary:
        session.add(Message(conversation_id=convo.id, role="assistant", content=itinerary))
    await session.commit()

    return PlanResponse(
        conversation_id=convo.id,
        thread_id=convo.thread_id,
        status="completed",
        reasoning=state.get("reasoning"),
        selected_agents=state.get("selected_agents", []),
        trip_constraints=TripConstraints(**constraints_raw) if constraints_raw else None,
        weather=WeatherInfo(**weather_raw) if weather_raw else None,
        itinerary_plan=itinerary,
        llm_calls=llm_calls,
    )
