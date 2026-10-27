from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_db, get_current_user, require_roles

router = APIRouter(prefix="/timetables", tags=["timetables"])

STAFF = ("Admin", "Department Head", "Teacher")
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
SLOTS = [
    "08:00-09:00",
    "09:00-10:00",
    "10:00-11:00",
    "11:00-12:00",
    "12:00-01:00",
    "01:00-02:00",
]
MAX_PER_DEPARTMENT = 50


class TimetableData(BaseModel):
    program: str
    semester: str
    section: str
    term: str
    department_id: int | None = None


class CourseData(BaseModel):
    code: str
    subject: str
    credit_hours: str | None = None
    faculty: str | None = None


class SlotData(BaseModel):
    day: str
    slot: str
    course_code: str
    room: str | None = None


class ContentData(BaseModel):
    courses: list[CourseData] = []
    slots: list[SlotData] = []


def summary(db, t):
    course_count = (
        db.query(models.TimetableCourse)
        .filter(models.TimetableCourse.timetable_id == t.id)
        .count()
    )
    slot_count = (
        db.query(models.TimetableSlot)
        .filter(models.TimetableSlot.timetable_id == t.id)
        .count()
    )
    return {
        "id": t.id,
        "program": t.program,
        "semester": t.semester,
        "section": t.section,
        "term": t.term,
        "status": t.status,
        "department_id": t.department_id,
        "course_count": course_count,
        "slot_count": slot_count,
    }


def detail(db, t):
    info = summary(db, t)
    courses = (
        db.query(models.TimetableCourse)
        .filter(models.TimetableCourse.timetable_id == t.id)
        .order_by(models.TimetableCourse.id)
        .all()
    )
    slots = (
        db.query(models.TimetableSlot)
        .filter(models.TimetableSlot.timetable_id == t.id)
        .order_by(models.TimetableSlot.id)
        .all()
    )
    info["courses"] = [
        {
            "code": c.code,
            "subject": c.subject,
            "credit_hours": c.credit_hours,
            "faculty": c.faculty,
        }
        for c in courses
    ]
    info["slots"] = [
        {"day": s.day, "slot": s.slot, "course_code": s.course_code, "room": s.room}
        for s in slots
    ]
    info["days"] = DAYS
    info["time_slots"] = SLOTS
    return info


def get_or_404(db, timetable_id):
    t = db.query(models.Timetable).filter(models.Timetable.id == timetable_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Timetable not found")
    return t


def can_manage(user, t):
    if user.role == "Admin":
        return True
    return user.role in STAFF and t.department_id == user.department_id


def can_view(user, t):
    if can_manage(user, t):
        return True
    return t.status == "Published" and (
        t.department_id is None or t.department_id == user.department_id
    )


def check_clashes(db, t, courses, slots):
    faculty_name = {c.code: (c.faculty or "").strip() for c in courses}
    other_faculty = {}
    for c in (
        db.query(models.TimetableCourse)
        .filter(models.TimetableCourse.timetable_id != t.id)
        .all()
    ):
        other_faculty[(c.timetable_id, c.code)] = (c.faculty or "").strip().lower()
    cells = {}
    for o in (
        db.query(models.TimetableSlot)
        .filter(models.TimetableSlot.timetable_id != t.id)
        .all()
    ):
        cells.setdefault((o.day, o.slot), []).append(o)
    clashes = []
    for s in slots:
        room = (s.room or "").strip().lower()
        name = faculty_name.get(s.course_code, "")
        for o in cells.get((s.day, s.slot), []):
            if room and room == (o.room or "").strip().lower():
                clashes.append("Room " + s.room + " is already used on " + s.day + " " + s.slot)
            if name and name.lower() == other_faculty.get((o.timetable_id, o.course_code), ""):
                clashes.append(name + " is already teaching on " + s.day + " " + s.slot)
    return list(dict.fromkeys(clashes))


@router.get("")
def list_timetables(db: Session = Depends(get_db), user=Depends(require_roles(*STAFF))):
    query = db.query(models.Timetable)
    if user.role != "Admin":
        query = query.filter(models.Timetable.department_id == user.department_id)
    rows = query.order_by(models.Timetable.id).all()
    return [summary(db, t) for t in rows]


@router.get("/published")
def list_published(db: Session = Depends(get_db), user=Depends(get_current_user)):
    query = db.query(models.Timetable).filter(models.Timetable.status == "Published")
    if user.role != "Admin":
        query = query.filter(
            or_(
                models.Timetable.department_id.is_(None),
                models.Timetable.department_id == user.department_id,
            )
        )
    rows = query.order_by(models.Timetable.id).all()
    return [summary(db, t) for t in rows]


@router.post("")
def create_timetable(
    data: TimetableData,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    if user.role == "Admin":
        department_id = data.department_id
    else:
        if user.department_id is None:
            raise HTTPException(status_code=400, detail="Your account has no department")
        department_id = user.department_id
    for value in (data.program, data.semester, data.section, data.term):
        if not value.strip():
            raise HTTPException(status_code=400, detail="Please fill in all the fields")
    count = (
        db.query(models.Timetable)
        .filter(models.Timetable.department_id == department_id)
        .count()
    )
    if count >= MAX_PER_DEPARTMENT:
        raise HTTPException(
            status_code=400,
            detail="A department can have at most " + str(MAX_PER_DEPARTMENT) + " timetables",
        )
    t = models.Timetable(
        department_id=department_id,
        program=data.program.strip(),
        semester=data.semester.strip(),
        section=data.section.strip(),
        term=data.term.strip(),
        status="Draft",
        created_by=user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return summary(db, t)


@router.get("/{timetable_id}")
def get_timetable(
    timetable_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    t = get_or_404(db, timetable_id)
    if not can_view(user, t):
        raise HTTPException(status_code=403, detail="You are not allowed to see this timetable")
    return detail(db, t)


@router.put("/{timetable_id}/content")
def save_content(
    timetable_id: int,
    data: ContentData,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    t = get_or_404(db, timetable_id)
    if not can_manage(user, t):
        raise HTTPException(status_code=403, detail="You cannot edit this timetable")

    codes = set()
    courses = []
    for c in data.courses:
        code = c.code.strip()
        subject = c.subject.strip()
        if not code or not subject:
            raise HTTPException(status_code=400, detail="Every course needs a code and a subject")
        if code in codes:
            raise HTTPException(status_code=400, detail="Course code " + code + " is used twice")
        codes.add(code)
        courses.append(
            models.TimetableCourse(
                timetable_id=t.id,
                code=code,
                subject=subject,
                credit_hours=(c.credit_hours or "").strip() or None,
                faculty=(c.faculty or "").strip() or None,
            )
        )

    seen = set()
    slots = []
    for s in data.slots:
        if s.day not in DAYS:
            raise HTTPException(status_code=400, detail="Invalid day: " + s.day)
        if s.slot not in SLOTS:
            raise HTTPException(status_code=400, detail="Invalid time slot: " + s.slot)
        if s.course_code not in codes:
            raise HTTPException(status_code=400, detail="Unknown course code: " + s.course_code)
        if (s.day, s.slot) in seen:
            raise HTTPException(status_code=400, detail="Two classes in " + s.day + " " + s.slot)
        seen.add((s.day, s.slot))
        slots.append(
            models.TimetableSlot(
                timetable_id=t.id,
                day=s.day,
                slot=s.slot,
                course_code=s.course_code,
                room=(s.room or "").strip() or None,
            )
        )

    clashes = check_clashes(db, t, courses, slots)
    if clashes:
        raise HTTPException(status_code=409, detail="; ".join(clashes))

    db.query(models.TimetableSlot).filter(models.TimetableSlot.timetable_id == t.id).delete()
    db.query(models.TimetableCourse).filter(models.TimetableCourse.timetable_id == t.id).delete()
    db.add_all(courses)
    db.add_all(slots)
    db.commit()
    return detail(db, t)


@router.post("/{timetable_id}/publish")
def publish_timetable(
    timetable_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    t = get_or_404(db, timetable_id)
    if not can_manage(user, t):
        raise HTTPException(status_code=403, detail="You cannot publish this timetable")
    slot_count = (
        db.query(models.TimetableSlot)
        .filter(models.TimetableSlot.timetable_id == t.id)
        .count()
    )
    if slot_count == 0:
        raise HTTPException(status_code=400, detail="Add at least one class before publishing")
    t.status = "Published"
    db.commit()
    return summary(db, t)


@router.post("/{timetable_id}/unpublish")
def unpublish_timetable(
    timetable_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    t = get_or_404(db, timetable_id)
    if not can_manage(user, t):
        raise HTTPException(status_code=403, detail="You cannot change this timetable")
    t.status = "Draft"
    db.commit()
    return summary(db, t)


@router.delete("/{timetable_id}")
def delete_timetable(
    timetable_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    t = get_or_404(db, timetable_id)
    allowed = user.role == "Admin" or (
        t.department_id == user.department_id
        and (user.role == "Department Head" or t.created_by == user.id)
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="You cannot delete this timetable")
    db.query(models.TimetableSlot).filter(models.TimetableSlot.timetable_id == t.id).delete()
    db.query(models.TimetableCourse).filter(models.TimetableCourse.timetable_id == t.id).delete()
    db.delete(t)
    db.commit()
    return {"deleted": timetable_id}
