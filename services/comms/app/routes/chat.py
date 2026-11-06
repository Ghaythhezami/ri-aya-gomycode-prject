from fastapi import APIRouter, Depends, Query, Response
from pymongo.asynchronous.database import AsyncDatabase

from app.auth import Principal, authenticate
from app.chat import ChatRepo
from app.db import get_db
from app.realtime import Realtime, get_realtime
from app.schemas import (
    ConversationIn,
    ConversationOut,
    MessageIn,
    MessageOut,
    MessagePageOut,
    UpdatedOut,
)

router = APIRouter(prefix="/v1/conversations", tags=["chat"])


def repo(db: AsyncDatabase = Depends(get_db)) -> ChatRepo:
    return ChatRepo(db)


@router.get("", response_model=list[ConversationOut])
async def list_conversations(p: Principal = Depends(authenticate), chat: ChatRepo = Depends(repo)):
    return await chat.list_for(p.clinic_id, p.user_id)


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation(
    body: ConversationIn,
    response: Response,
    p: Principal = Depends(authenticate),
    chat: ChatRepo = Depends(repo),
):
    conversation, created = await chat.create(p.clinic_id, p.user_id, body.member_ids, body.title)
    if not created:
        response.status_code = 200
    return conversation


@router.get("/{conversation_id}/messages", response_model=MessagePageOut)
async def list_messages(
    conversation_id: str,
    cursor: str | None = Query(default=None, max_length=300),
    limit: int = Query(default=30, ge=1, le=50),
    p: Principal = Depends(authenticate),
    chat: ChatRepo = Depends(repo),
):
    return await chat.list_messages(p.clinic_id, p.user_id, conversation_id, cursor, limit)


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def post_message(
    conversation_id: str,
    body: MessageIn,
    p: Principal = Depends(authenticate),
    chat: ChatRepo = Depends(repo),
    rt: Realtime = Depends(get_realtime),
):
    message, members = await chat.post_message_to(
        p.clinic_id, p.user_id, conversation_id, body.body
    )
    await rt.chat_message(conversation_id, message, members)
    return message


@router.post("/{conversation_id}/read", response_model=UpdatedOut)
async def read_conversation(
    conversation_id: str,
    p: Principal = Depends(authenticate),
    chat: ChatRepo = Depends(repo),
    rt: Realtime = Depends(get_realtime),
):
    updated, members = await chat.mark_read_for(p.clinic_id, p.user_id, conversation_id)
    await rt.chat_read(conversation_id, p.user_id, members)
    return {"updated": updated}
