"""Conversation CRUD."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_session
from ..models import Conversation
from ..schemas import ConversationDetail, ConversationRead, MessageRead

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationRead])
async def list_conversations(
    session: AsyncSession = Depends(get_session),
) -> list[Conversation]:
    result = await session.scalars(select(Conversation).order_by(Conversation.updated_at.desc()))
    return list(result)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ConversationDetail:
    convo = await session.scalar(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.messages))
    )
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationDetail(
        id=convo.id,
        thread_id=convo.thread_id,
        title=convo.title,
        created_at=convo.created_at,
        updated_at=convo.updated_at,
        messages=[
            MessageRead(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
            for m in convo.messages
        ],
    )
