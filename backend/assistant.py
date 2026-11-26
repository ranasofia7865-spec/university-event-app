import base64
import json
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from assistant_core import AssistantError, PLACEHOLDER, fill_from_text, transcribe_audio, write_notice
from auth import get_db, require_roles

router = APIRouter(prefix="/assistant", tags=["assistant"])

STAFF = ("Admin", "Department Head", "Teacher")


class Attachment(BaseModel):
    name: str = "file"
    mime: str
    data: str


class AssistIn(BaseModel):
    text: str
    template_id: int | None = None
    attachment: Attachment | None = None


FILE_TYPES = ("image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain")
MAX_FILE = 6 * 1024 * 1024


class ValuesIn(BaseModel):
    values: dict[str, str] | None = None
    title: str | None = None
    body: str | None = None


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


def nice_date(d):
    return str(d.day) + " " + d.strftime("%B %Y")


def load_context(db):
    today = date.today()
    events = (
        db.query(models.Event)
        .filter(
            models.Event.event_date >= today - timedelta(days=30),
            models.Event.event_date <= today + timedelta(days=520),
            models.Event.status != "Cancelled",
        )
        .order_by(models.Event.event_date)
        .limit(70)
        .all()
    )
    depts = {d.id: d.name for d in db.query(models.Department).all()}
    calendar = []
    for e in events:
        when = nice_date(e.event_date)
        if e.end_date and e.end_date != e.event_date:
            when += " to " + nice_date(e.end_date)
        scope = depts.get(e.department_id, "whole university") if e.department_id else "whole university"
        calendar.append(e.title + " | " + when + " | " + e.event_type + " | " + scope)
    return {"calendar": calendar, "departments": sorted(depts.values())}


def recent_history(db, chat_id, limit=8):
    rows = (
        db.query(models.AssistantMessage)
        .filter(models.AssistantMessage.chat_id == chat_id)
        .order_by(models.AssistantMessage.id.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()
    last_doc = -1
    for i, m in enumerate(rows):
        if m.notice_json and '"document"' in m.notice_json:
            last_doc = i
    out = []
    for i, m in enumerate(rows):
        text = m.content
        if m.notice_json:
            n = json.loads(m.notice_json)
            if n.get("body"):
                text += "\n[Notice written]\nTitle: " + n.get("title", "") + "\n" + n["body"][:900]
            elif n.get("document"):
                import documents

                if i == last_doc:
                    text += "\n[Document prepared, as JSON]\n" + json.dumps(n["document"], ensure_ascii=False)[:9000]
                else:
                    text += "\n[Document prepared: " + documents.summary(n["document"]) + "]"
        out.append({"role": m.role, "content": text})
    return out


def style_examples(db):
    return [t.name + ": " + t.content for t in db.query(models.Template).order_by(models.Template.name).all()]


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
        return fill_from_text(load_templates(db), body.text, body.template_id, context=load_context(db))
    except AssistantError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


AUDIO_TYPES = ("audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/flac", "audio/aac")
MAX_AUDIO = 6 * 1024 * 1024


@router.post("/transcribe")
async def transcribe(request: Request, user=Depends(require_roles(*STAFF))):
    mime = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if mime not in AUDIO_TYPES:
        raise HTTPException(status_code=400, detail="This audio format is not supported")
    data = await request.body()
    if len(data) < 2000:
        raise HTTPException(status_code=400, detail="The recording is too short or empty")
    if len(data) > MAX_AUDIO:
        raise HTTPException(status_code=413, detail="The recording is too long. Keep it under one minute.")
    try:
        text = await run_in_threadpool(transcribe_audio, data, mime)
    except AssistantError as e:
        raise HTTPException(status_code=e.status, detail=e.message)
    return {"text": text}


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
    history = recent_history(db, chat.id)
    media = None
    label = ""
    if body.attachment is not None:
        if body.attachment.mime not in FILE_TYPES:
            raise HTTPException(status_code=400, detail="This file type is not supported. Use a picture, a PDF or a text file.")
        try:
            raw_file = base64.b64decode(body.attachment.data, validate=True)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="The attached file could not be read")
        if len(raw_file) > MAX_FILE:
            raise HTTPException(status_code=413, detail="The attached file is too big (maximum 6 MB)")
        media = (raw_file, body.attachment.mime)
        label = "\n[Attached file: " + body.attachment.name[:80] + "]"
    try:
        result = write_notice(
            history, body.text, context=load_context(db), styles=style_examples(db), attachment=media
        )
    except AssistantError as e:
        raise HTTPException(status_code=e.status, detail=e.message)

    text = body.text.strip() + label
    now = datetime.utcnow()
    user_msg = models.AssistantMessage(chat_id=chat.id, role="user", content=text, created_at=now)
    bot_msg = models.AssistantMessage(
        chat_id=chat.id,
        role="assistant",
        content=result["reply"],
        notice_json=(
            json.dumps(result["notice"], ensure_ascii=False)
            if result["notice"]
            else json.dumps({"document": result["document"]}, ensure_ascii=False)
            if result.get("document")
            else None
        ),
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


@router.post("/messages/{message_id}/pdf")
def document_pdf(message_id: int, db: Session = Depends(get_db), user=Depends(require_roles(*STAFF))):
    import documents

    msg = db.query(models.AssistantMessage).filter(models.AssistantMessage.id == message_id).first()
    if not msg or not msg.notice_json:
        raise HTTPException(status_code=404, detail="Message not found")
    own_chat(db, msg.chat_id, user)
    notice = json.loads(msg.notice_json)
    doc = notice.get("document")
    if not doc:
        raise HTTPException(status_code=400, detail="This message has no document")
    department = None
    if user.department_id is not None:
        d = db.query(models.Department).filter(models.Department.id == user.department_id).first()
        department = d.name if d else None
    try:
        pdf = documents.build_pdf(doc, department)
    except Exception:
        raise HTTPException(status_code=500, detail="The PDF could not be built. Please check the data and try again.")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="' + documents.file_name(doc) + '"'},
    )


def sheet_label(s):
    return (s.get("program", "") + " " + s.get("semester", "") + " " + s.get("section", "")).strip() or "Class"


def reason_of(e):
    return e.detail if isinstance(e.detail, str) else "It could not be saved."


def save_datesheet_drafts(doc, saved, db, user):
    import datesheets

    done, failed = [], []
    for s in doc["sheets"]:
        label = sheet_label(s)
        if label in saved:
            continue
        if not doc.get("term"):
            failed.append({"label": label, "reason": "The term is missing. Tell me the term, for example Fall 2026."})
            continue
        if not s.get("session"):
            failed.append({"label": label, "reason": "The session is missing. Tell me the session, for example 2023-2027."})
            continue
        no_date = [r for r in s["rows"] if not r["date"]]
        rows = [r for r in s["rows"] if r["date"] and r["subject"]]
        if no_date or not rows:
            failed.append({"label": label, "reason": "Some papers have no date or no subject. Tell me the missing dates."})
            continue
        created = None
        try:
            created = datesheets.create_datesheet(
                data=datesheets.DatesheetCreate(
                    kind=doc.get("exam_kind") or "Mid-term",
                    term=doc["term"],
                    program=s["program"],
                    semester=s["semester"],
                    session=s["session"],
                    section=s["section"],
                ),
                db=db,
                user=user,
            )
            datesheets.save_datesheet(
                datesheet_id=created["id"],
                data=datesheets.SaveData(
                    incharge_bsit=s["incharge_bsit"] or None,
                    incharge_bscs=s["incharge_bscs"] or None,
                    director=s["director"] or None,
                    rows=[
                        datesheets.RowData(
                            exam_date=date.fromisoformat(r["date"]),
                            subject=r["subject"],
                            time_text=r["time"] or None,
                            venue=r["venue"] or None,
                            instructor=r["instructor"] or None,
                            duty=r["duty"] or None,
                        )
                        for r in rows
                    ],
                ),
                db=db,
                user=user,
            )
            done.append(label)
        except HTTPException as e:
            if created:
                db.rollback()
                db.query(models.DatesheetRow).filter(models.DatesheetRow.datesheet_id == created["id"]).delete()
                db.query(models.Datesheet).filter(models.Datesheet.id == created["id"]).delete()
                db.commit()
            failed.append({"label": label, "reason": reason_of(e)})
    return done, failed


def save_timetable_drafts(doc, saved, db, user):
    import timetables

    done, failed = [], []
    for s in doc["sheets"]:
        label = sheet_label(s)
        if label in saved:
            continue
        if not doc.get("term"):
            failed.append({"label": label, "reason": "The term is missing. Tell me the term, for example Spring 2027."})
            continue
        if any(d not in timetables.DAYS for d in s["days"]) or any(t not in timetables.SLOTS for t in s["time_slots"]):
            failed.append(
                {
                    "label": label,
                    "reason": "The Timetable screen only supports Monday to Friday and the slots 08:00-09:00 to 01:00-02:00. "
                    "You can still download the PDF.",
                }
            )
            continue
        courses = [c for c in s["courses"] if c["code"] and c["subject"]]
        codes = {c["code"] for c in courses}
        slots = [c for c in s["slots"] if c["course_code"] in codes]
        created = None
        try:
            created = timetables.create_timetable(
                data=timetables.TimetableData(
                    program=s["program"], semester=s["semester"], section=s["section"], term=doc["term"]
                ),
                db=db,
                user=user,
            )
            timetables.save_content(
                timetable_id=created["id"],
                data=timetables.ContentData(
                    courses=[
                        timetables.CourseData(
                            code=c["code"],
                            subject=c["subject"],
                            credit_hours=c["credit_hours"] or None,
                            faculty=c["faculty"] or None,
                        )
                        for c in courses
                    ],
                    slots=[
                        timetables.SlotData(
                            day=c["day"], slot=c["slot"], course_code=c["course_code"], room=c["room"] or None
                        )
                        for c in slots
                    ],
                ),
                db=db,
                user=user,
            )
            done.append(label)
        except HTTPException as e:
            if created:
                db.rollback()
                db.query(models.TimetableSlot).filter(models.TimetableSlot.timetable_id == created["id"]).delete()
                db.query(models.TimetableCourse).filter(models.TimetableCourse.timetable_id == created["id"]).delete()
                db.query(models.Timetable).filter(models.Timetable.id == created["id"]).delete()
                db.commit()
            failed.append({"label": label, "reason": reason_of(e)})
    return done, failed


@router.post("/messages/{message_id}/save-drafts")
def save_drafts(message_id: int, db: Session = Depends(get_db), user=Depends(require_roles(*STAFF))):
    msg = db.query(models.AssistantMessage).filter(models.AssistantMessage.id == message_id).first()
    if not msg or not msg.notice_json:
        raise HTTPException(status_code=404, detail="Message not found")
    own_chat(db, msg.chat_id, user)
    notice = json.loads(msg.notice_json)
    doc = notice.get("document")
    if not doc or doc.get("kind") not in ("datesheet", "timetable"):
        raise HTTPException(status_code=400, detail="Only datesheets and timetables can be saved to the screens")
    saved = notice.get("saved") or []
    if doc["kind"] == "datesheet":
        done, failed = save_datesheet_drafts(doc, saved, db, user)
    else:
        done, failed = save_timetable_drafts(doc, saved, db, user)
    notice["saved"] = saved + done
    msg.notice_json = json.dumps(notice, ensure_ascii=False)
    db.commit()
    db.refresh(msg)
    return {"message": message_out(msg), "saved": done, "failed": failed}


@router.post("/messages/{message_id}/publish")
def publish_notice(message_id: int, db: Session = Depends(get_db), user=Depends(require_roles(*STAFF))):
    msg = db.query(models.AssistantMessage).filter(models.AssistantMessage.id == message_id).first()
    if not msg or not msg.notice_json:
        raise HTTPException(status_code=404, detail="Message not found")
    own_chat(db, msg.chat_id, user)
    notice = json.loads(msg.notice_json)
    if "body" not in notice:
        raise HTTPException(status_code=400, detail="This is an old style notice. Ask me to write it again.")
    if notice.get("published"):
        raise HTTPException(status_code=400, detail="This notice is already published")
    if user.role == "Admin":
        department_id = None
    else:
        if user.department_id is None:
            raise HTTPException(status_code=400, detail="Your account has no department")
        department_id = user.department_id
    n = models.Notification(
        category="Event" if notice.get("category") in ("event", "test", "meeting") else "Notice",
        title=notice["title"][:200],
        body=notice["body"],
        department_id=department_id,
        created_by=user.id,
    )
    db.add(n)
    db.flush()
    notice["published"] = True
    notice["notification_id"] = n.id
    msg.notice_json = json.dumps(notice, ensure_ascii=False)
    db.commit()
    db.refresh(msg)
    return message_out(msg)


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
    if "document" in notice:
        raise HTTPException(status_code=400, detail="Documents cannot be edited here. Ask me to change it in the chat.")
    if "body" in notice:
        title = (body.title or "").strip()
        text = (body.body or "").strip()
        if not title or not text:
            raise HTTPException(status_code=400, detail="The title and the notice text cannot be empty")
        if notice.get("published"):
            raise HTTPException(status_code=400, detail="This notice is already published and cannot be edited here")
        notice["title"] = title[:150]
        notice["body"] = text[:2500]
        msg.notice_json = json.dumps(notice, ensure_ascii=False)
        db.commit()
        db.refresh(msg)
        return message_out(msg)
    body.values = body.values or {}
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
