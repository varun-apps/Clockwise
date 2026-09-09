"""POST /plan and POST /plan/resume — run the orchestration graph.

`/plan` runs the graph under a single Langfuse span keyed by the conversation's
thread_id. The graph interrupts at human review; when it does, `/plan` returns
`status="awaiting_review"` with the draft itinerary and the connection closes —
no worker is held. `/plan/resume` rehydrates from the checkpoint (by thread_id)
and continues with the traveler's decision. A guardrail BLOCK short-circuits to
`status="blocked"`.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session, get_sessionmaker
from ..graph.outcome import is_paused_at_review, plan_response
from ..logging import get_logger
from ..models import Conversation, Message
from ..observability import span
from ..schemas import (
    PlanRequest,
    PlanResponse,
    ResumeRequest,
    StreamError,
    StreamMeta,
    StreamNode,
    StreamResult,
)

log = get_logger(__name__)

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

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


async def _get_conversation(session: AsyncSession, conversation_id: uuid.UUID) -> Conversation:
    convo = await session.scalar(select(Conversation).where(Conversation.id == conversation_id))
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return convo


def _config_for(thread_id: str, gateway: Any, memory: Any) -> dict[str, Any]:
    return {
        "configurable": {
            "thread_id": thread_id,
            "gateway": gateway,
            "memory": memory,
        }
    }


def _decision_for(action: str, feedback: str | None) -> dict[str, Any]:
    decision: dict[str, Any] = {"action": action}
    if action == "request_changes":
        decision["feedback"] = feedback or ""
    return decision


def _assistant_content(resp: PlanResponse, state: dict[str, Any]) -> str | None:
    """The assistant message to persist for a terminal outcome, if any."""
    if resp.status == "blocked":
        return resp.blocked_reason
    if resp.status == "awaiting_review":
        return state.get("itinerary_plan")
    return state.get("summary") or state.get("itinerary_plan")


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

    config = _config_for(convo.thread_id, gateway, request.app.state.memory)
    with span("clockwise.plan", thread_id=convo.thread_id):
        await graph.ainvoke(
            {
                "user_query": body.query,
                "user_id": body.user_id,
                "messages": [{"role": "user", "content": body.query}],
            },
            config,
        )

    snapshot = await graph.aget_state(config)
    resp = plan_response(
        conversation_id=convo.id,
        thread_id=convo.thread_id,
        state=snapshot.values,
        next_nodes=snapshot.next,
    )

    content = _assistant_content(resp, snapshot.values)
    if content:
        session.add(Message(conversation_id=convo.id, role="assistant", content=content))
    await session.commit()
    return resp


@router.post("/plan/resume", response_model=PlanResponse)
async def resume(
    body: ResumeRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> PlanResponse:
    graph = request.app.state.graph
    gateway = request.app.state.gateway

    convo = await _get_conversation(session, body.conversation_id)
    config = _config_for(convo.thread_id, gateway, request.app.state.memory)

    # Only resume a conversation that is actually paused at review.
    snapshot = await graph.aget_state(config)
    if not is_paused_at_review(snapshot.next):
        raise HTTPException(status_code=409, detail="Conversation is not awaiting review")

    decision = _decision_for(body.action, body.feedback)
    if body.action == "request_changes":
        session.add(
            Message(
                conversation_id=convo.id,
                role="user",
                content=f"[request changes] {body.feedback or ''}".strip(),
            )
        )

    with span("clockwise.resume", thread_id=convo.thread_id):
        await graph.ainvoke(Command(resume=decision), config)

    snapshot = await graph.aget_state(config)
    resp = plan_response(
        conversation_id=convo.id,
        thread_id=convo.thread_id,
        state=snapshot.values,
        next_nodes=snapshot.next,
    )

    content = _assistant_content(resp, snapshot.values)
    if content:
        session.add(Message(conversation_id=convo.id, role="assistant", content=content))
    await session.commit()
    return resp


# --- Streaming variants ------------------------------------------------------
# `/plan/stream` and `/plan/resume/stream` emit the same graph run as SSE so the
# UI can show live per-node progress. They are additive; the blocking endpoints
# above are unchanged. The generator must NOT touch the request-scoped session
# (it is torn down when the endpoint returns, before the body streams), so it
# opens its own session for the post-run assistant write.

_StreamEvent = StreamMeta | StreamNode | StreamError | StreamResult


def _sse(event: _StreamEvent) -> str:
    return f"event: {event.type}\ndata: {event.model_dump_json()}\n\n"


async def _stream_graph(
    graph: Any,
    config: dict[str, Any],
    graph_input: Any,
    convo_id: uuid.UUID,
    thread_id: str,
    span_name: str,
) -> AsyncIterator[str]:
    yield _sse(StreamMeta(conversation_id=convo_id, thread_id=thread_id))
    try:
        with span(span_name, thread_id=thread_id):
            async for chunk in graph.astream(graph_input, config, stream_mode="updates"):
                for node_name, delta in chunk.items():
                    if node_name == "__interrupt__":
                        continue
                    selected = delta.get("selected_agents") if isinstance(delta, dict) else None
                    yield _sse(StreamNode(node=node_name, selected_agents=selected))

        # Authoritative terminal state — never hand-merge the astream deltas.
        snapshot = await graph.aget_state(config)
        state = snapshot.values

        async with get_sessionmaker()() as session:
            convo = await session.scalar(select(Conversation).where(Conversation.id == convo_id))
            if convo is None:  # pragma: no cover - conversation was committed upstream
                yield _sse(StreamError(message="Conversation not found."))
                return

            resp = plan_response(
                conversation_id=convo_id,
                thread_id=thread_id,
                state=state,
                next_nodes=snapshot.next,
            )
            content = _assistant_content(resp, state)
            if content:
                session.add(Message(conversation_id=convo_id, role="assistant", content=content))
            await session.commit()
            yield _sse(StreamResult(type=resp.status, plan=resp))
    except asyncio.CancelledError:  # client disconnected — stop quietly
        raise
    except Exception as exc:  # noqa: BLE001 - headers already sent; report as an event
        log.error("plan.stream_failed", thread_id=thread_id, error=str(exc))
        yield _sse(StreamError(message="Streaming failed."))


@router.post("/plan/stream")
async def plan_stream(
    body: PlanRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    graph = request.app.state.graph
    gateway = request.app.state.gateway

    convo = await _get_or_create_conversation(session, body.conversation_id, body.query)
    session.add(Message(conversation_id=convo.id, role="user", content=body.query))
    await session.commit()

    config = _config_for(convo.thread_id, gateway, request.app.state.memory)
    graph_input = {
        "user_query": body.query,
        "user_id": body.user_id,
        "messages": [{"role": "user", "content": body.query}],
    }
    return StreamingResponse(
        _stream_graph(
            graph, config, graph_input, convo.id, convo.thread_id, "clockwise.plan.stream"
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/plan/resume/stream")
async def resume_stream(
    body: ResumeRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    graph = request.app.state.graph
    gateway = request.app.state.gateway

    convo = await _get_conversation(session, body.conversation_id)
    config = _config_for(convo.thread_id, gateway, request.app.state.memory)

    snapshot = await graph.aget_state(config)
    if not is_paused_at_review(snapshot.next):
        raise HTTPException(status_code=409, detail="Conversation is not awaiting review")

    decision = _decision_for(body.action, body.feedback)
    if body.action == "request_changes":
        session.add(
            Message(
                conversation_id=convo.id,
                role="user",
                content=f"[request changes] {body.feedback or ''}".strip(),
            )
        )
    await session.commit()

    return StreamingResponse(
        _stream_graph(
            graph, config, Command(resume=decision), convo.id, convo.thread_id,
            "clockwise.resume.stream",
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
