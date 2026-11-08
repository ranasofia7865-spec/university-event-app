import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from assistant_core import AssistantError, PLACEHOLDER, fill_from_text
from auth import get_db, require_roles

router = APIRouter(prefix="/assistant", tags=["assistant"])

STAFF = ("Admin", "Department Head", "Teacher")


class AssistIn(BaseModel):
    text: str
    template_id: int | None = None


class ValuesIn(BaseModel):
    values: dict[str, str]


def load_templates(db):
    rows = db.query(models.Template).order_by(models.Template.name).all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "content": t.content,
            "fields": list(dict.fromkeys(PLACEHOLDER.findall(t.content))),
        }
        for t in rows
    ]


def stamp(d):
    return d.isoformat() + "Z" if d else None


def message_out(m):
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "notice": json.loads(m.notice_json) if m.notice_json else None,
        "created_at": stamp(m.created_at),
    }


def chat_out(c):
    return {"id": c.id, "title": c.title, "updated_at": stamp(c.updated_at)}


def own_chat(db, chat_id, user):
    chat = (
        db.query(models.AssistantChat)
        .filter(models.AssistantChat.id == chat_id, models.AssistantChat.user_id == user.id)
        .first()
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


def last_notice(db, chat_id):
    m = (
        db.query(models.AssistantMessage)
        .filter(
            models.AssistantMessage.chat_id == chat_id,
            models.AssistantMessage.role == "assistant",
            models.AssistantMessage.notice_json.isnot(None),
        )
        .order_by(models.AssistantMessage.id.desc())
        .first()
    )
    if not m:
        return None
    n = json.loads(m.notice_json)
    return {"template_id": n["template_id"], "values": n.get("values", {})}


@router.post("/fill")
def assistant_fill(
    body: AssistIn,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    try:
        return fill_from_text(load_templates(db), body.text, body.template_id)
    except AssistantError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


@router.get("/chats")
def list_chats(db: Session = Depends(get_db), user=Depends(require_roles(*STAFF))):
    rows = (
        db.query(models.AssistantChat)
        .filter(models.AssistantChat.user_id == user.id)
        .order_by(models.AssistantChat.updated_at.desc())
        .limit(200)
        .all()
    )
    return [chat_out(c) for c in rows]


@router.post("/chats")
def create_chat(db: Session = Depends(get_db), user=Depends(require_roles(*STAFF))):
    now = datetime.utcnow()
    chat = models.AssistantChat(user_id=user.id, title="New chat", created_at=now, updated_at=now)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat_out(chat)


@router.get("/chats/{chat_id}")
def get_chat(chat_id: int, db: Session = Depends(get_db), user=Depends(require_roles(*STAFF))):
    chat = own_chat(db, chat_id, user)
    msgs = (
        db.query(models.AssistantMessage)
        .filter(models.AssistantMessage.chat_id == chat.id)
        .order_by(models.AssistantMessage.id)
        .all()
    )
    return {"chat": chat_out(chat), "messages": [message_out(m) for m in msgs]}


@router.delete("/chats/{chat_id}")
def delete_chat(chat_id: int, db: Session = Depends(get_db), user=Depends(require_roles(*STAFF))):
    chat = own_chat(db, chat_id, user)
    db.query(models.AssistantMessage).filter(models.AssistantMessage.chat_id == chat.id).delete()
    db.delete(chat)
    db.commit()
    return {"ok": True}


@router.post("/chats/{chat_id}/messages")
def send_message(
    chat_id: int,
    body: AssistIn,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    chat = own_chat(db, chat_id, user)
    previous = last_notice(db, chat.id)
    try:
        result = fill_from_text(load_templates(db), body.text, body.template_id, previous=previous)
    except AssistantError as e:
        raise HTTPException(status_code=e.status, detail=e.message)

    text = body.text.strip()
    now = datetime.utcnow()
    user_msg = models.AssistantMessage(chat_id=chat.id, role="user", content=text, created_at=now)
    reply = "I updated the notice:" if previous else "Here is the notice:"
    notice = {
        "template_id": result["template_id"],
        "name": result["name"],
        "fields": result["fields"],
        "values": result["values"],
        "missing": result["missing"],
        "text": result["text"],
    }
    bot_msg = models.AssistantMessage(
        chat_id=chat.id,
        role="assistant",
        content=reply,
        notice_json=json.dumps(notice, ensure_ascii=False),
        created_at=now,
    )
    db.add(user_msg)
    db.add(bot_msg)
    if chat.title == "New chat":
        chat.title = text[:40] + ("..." if len(text) > 40 else "")
    chat.updated_at = now
    db.commit()
    db.refresh(user_msg)
    db.refresh(bot_msg)
    db.refresh(chat)
    return {"chat": chat_out(chat), "messages": [message_out(user_msg), message_out(bot_msg)]}


@router.patch("/messages/{message_id}")
def edit_notice(
    message_id: int,
    body: ValuesIn,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    msg = db.query(models.AssistantMessage).filter(models.AssistantMessage.id == message_id).first()
    if not msg or not msg.notice_json:
        raise HTTPException(status_code=404, detail="Message not found")
    own_chat(db, msg.chat_id, user)
    notice = json.loads(msg.notice_json)
    template = next((t for t in load_templates(db) if t["id"] == notice["template_id"]), None)
    if not template:
        raise HTTPException(status_code=404, detail="The template of this notice no longer exists")
    values = {}
    for field in template["fields"]:
        v = (body.values.get(field) or "").strip()
        if v:
            values[field] = v[:200]
    text = template["content"]
    missing = []
    for field in template["fields"]:
        if field in values:
            text = text.replace("{" + field + "}", values[field])
        else:
            missing.append(field)
    notice.update({"values": values, "missing": missing, "text": text, "fields": template["fields"]})
    msg.notice_json = json.dumps(notice, ensure_ascii=False)
    db.commit()
    db.refresh(msg)
    return message_out(msg)
