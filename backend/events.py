from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_db, get_current_user, require_roles

router = APIRouter(prefix="/events", tags=["events"])

EVENT_TYPES = ["Exam", "Event", "Meeting", "Holiday", "Deadline"]


class EventData(BaseModel):
    title: str
    description: str | None = None
    event_date: date
    end_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    event_type: str
    department_id: int | None = None
    template_id: int | None = None


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    event_date: date | None = None
    end_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    event_type: str | None = None
    template_id: int | None = None


def to_dict(e):
    return {
        "id": e.id,
        "title": e.title,
        "description": e.description,
        "event_date": e.event_date.isoformat() if e.event_date else None,
        "end_date": e.end_date.isoformat() if e.end_date else None,
        "start_time": e.start_time.isoformat() if e.start_time else None,
        "end_time": e.end_time.isoformat() if e.end_time else None,
        "event_type": e.event_type,
        "status": e.status,
        "department_id": e.department_id,
        "created_by": e.created_by,
        "template_id": e.template_id,
    }


def check_times(start, end):
    if start and end and end <= start:
        raise HTTPException(status_code=400, detail="End time must be after start time")


def check_dates(start, end):
    if end and end < start:
        raise HTTPException(status_code=400, detail="End date cannot be before the start date")


def can_see(user, event):
    if user.role == "Admin":
        return True
    return event.department_id is None or event.department_id == user.department_id


def can_edit(user, event):
    if user.role == "Admin":
        return True
    if user.role == "Department Head":
        return event.department_id == user.department_id
    if user.role == "Teacher":
        return event.created_by == user.id
    return False


def get_event_or_404(db, event_id):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.get("")
def list_events(db: Session = Depends(get_db), user=Depends(get_current_user)):
    query = db.query(models.Event)
    if user.role != "Admin":
        query = query.filter(
            or_(
                models.Event.department_id.is_(None),
                models.Event.department_id == user.department_id,
            )
        )
    rows = query.order_by(models.Event.event_date, models.Event.start_time).all()
    return [to_dict(e) for e in rows]


@router.get("/{event_id}")
def get_event(event_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    event = get_event_or_404(db, event_id)
    if not can_see(user, event):
        raise HTTPException(status_code=403, detail="You are not allowed to see this event")
    return to_dict(event)


@router.post("")
def create_event(
    data: EventData,
    db: Session = Depends(get_db),
    user=Depends(require_roles("Admin", "Department Head", "Teacher")),
):
    if data.event_type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Event type must be Exam, Event, Meeting, Holiday or Deadline")
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    check_times(data.start_time, data.end_time)
    check_dates(data.event_date, data.end_date)

    if user.role == "Admin":
        department_id = data.department_id
    else:
        if user.department_id is None:
            raise HTTPException(status_code=400, detail="Your account has no department")
        department_id = user.department_id

    event = models.Event(
        title=data.title.strip(),
        description=data.description,
        event_date=data.event_date,
        end_date=data.end_date,
        start_time=data.start_time,
        end_time=data.end_time,
        event_type=data.event_type,
        status="Scheduled",
        department_id=department_id,
        created_by=user.id,
        template_id=data.template_id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return to_dict(event)


@router.put("/{event_id}")
def update_event(
    event_id: int,
    data: EventUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("Admin", "Department Head", "Teacher")),
):
    event = get_event_or_404(db, event_id)
    if not can_edit(user, event):
        raise HTTPException(status_code=403, detail="You cannot edit this event")
    if event.status == "Cancelled":
        raise HTTPException(status_code=400, detail="A cancelled event cannot be edited")

    changes = data.model_dump(exclude_unset=True)
    if "event_type" in changes and changes["event_type"] not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Event type must be Exam, Event, Meeting, Holiday or Deadline")

    old = (event.event_date, event.end_date, event.start_time, event.end_time)
    for field, value in changes.items():
        setattr(event, field, value)
    check_times(event.start_time, event.end_time)
    check_dates(event.event_date, event.end_date)

    new = (event.event_date, event.end_date, event.start_time, event.end_time)
    if new != old:
        event.status = "Rescheduled"

    db.commit()
    db.refresh(event)
    return to_dict(event)


@router.post("/{event_id}/cancel")
def cancel_event(
    event_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles("Admin", "Department Head", "Teacher")),
):
    event = get_event_or_404(db, event_id)
    if not can_edit(user, event):
        raise HTTPException(status_code=403, detail="You cannot cancel this event")
    event.status = "Cancelled"
    db.commit()
    db.refresh(event)
    return to_dict(event)
