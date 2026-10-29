from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_db, get_current_user, require_roles

router = APIRouter(prefix="/notifications", tags=["notifications"])

STAFF = ("Admin", "Department Head", "Teacher")
CATEGORIES = ["Timetable", "Datesheet", "FYP", "Event", "Notice"]


class NotificationData(BaseModel):
    category: str
    title: str
    body: str | None = None
    department_id: int | None = None


def to_dict(n):
    return {
        "id": n.id,
        "category": n.category,
        "title": n.title,
        "body": n.body,
        "department_id": n.department_id,
        "created_by": n.created_by,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
def list_notifications(db: Session = Depends(get_db), user=Depends(get_current_user)):
    query = db.query(models.Notification)
    if user.role != "Admin":
        query = query.filter(
            or_(
                models.Notification.department_id.is_(None),
                models.Notification.department_id == user.department_id,
            )
        )
    rows = query.order_by(models.Notification.created_at.desc()).limit(50).all()
    return [to_dict(n) for n in rows]


@router.post("")
def create_notification(
    data: NotificationData,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    if data.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Category must be one of: " + ", ".join(CATEGORIES))
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    if user.role == "Admin":
        department_id = data.department_id
    else:
        if user.department_id is None:
            raise HTTPException(status_code=400, detail="Your account has no department")
        department_id = user.department_id
    n = models.Notification(
        category=data.category,
        title=data.title.strip(),
        body=(data.body or "").strip() or None,
        department_id=department_id,
        created_by=user.id,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return to_dict(n)


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    n = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    allowed = (
        user.role == "Admin"
        or n.created_by == user.id
        or (user.role == "Department Head" and n.department_id == user.department_id)
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="You cannot delete this notice")
    db.delete(n)
    db.commit()
    return {"deleted": notification_id}
