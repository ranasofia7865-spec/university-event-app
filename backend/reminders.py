from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_db, get_current_user
from events import to_dict

router = APIRouter(prefix="/reminders", tags=["reminders"])


def visible_events(db, user):
    query = db.query(models.Event)
    if user.role != "Admin":
        query = query.filter(
            or_(
                models.Event.department_id.is_(None),
                models.Event.department_id == user.department_id,
            )
        )
    return query


def make_label(event, today):
    if event.event_date < today:
        return "Happening now"
    days_left = (event.event_date - today).days
    if days_left == 0:
        return "Today"
    if days_left == 1:
        return "Tomorrow"
    return "In " + str(days_left) + " days"


@router.get("/upcoming")
def upcoming(days: int = 14, db: Session = Depends(get_db), user=Depends(get_current_user)):
    days = max(1, min(days, 365))
    today = date.today()
    last = today + timedelta(days=days)
    query = visible_events(db, user).filter(
        models.Event.status != "Cancelled",
        models.Event.event_date <= last,
        or_(models.Event.event_date >= today, models.Event.end_date >= today),
    )
    rows = query.order_by(models.Event.event_date, models.Event.start_time).all()
    result = []
    for e in rows:
        item = to_dict(e)
        item["label"] = make_label(e, today)
        result.append(item)
    return result


@router.get("/changes")
def changes(db: Session = Depends(get_db), user=Depends(get_current_user)):
    today = date.today()
    query = visible_events(db, user).filter(
        models.Event.status.in_(["Rescheduled", "Cancelled"]),
        or_(models.Event.event_date >= today, models.Event.end_date >= today),
    )
    rows = query.order_by(models.Event.event_date).all()
    return [to_dict(e) for e in rows]
