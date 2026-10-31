import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_db, get_current_user, require_roles
from datesheet_pdf import build_pdf

router = APIRouter(prefix="/datesheets", tags=["datesheets"])

STAFF = ("Admin", "Department Head", "Teacher")
KINDS = ["Mid-term", "Final term"]
MAX_PER_DEPARTMENT = 50
MAX_ROWS = 40


class DatesheetCreate(BaseModel):
    kind: str
    term: str
    program: str
    semester: str
    session: str
    section: str
    department_id: int | None = None
    copy_from: int | None = None


class RowData(BaseModel):
    exam_date: date
    subject: str
    time_text: str | None = None
    venue: str | None = None
    instructor: str | None = None
    duty: str | None = None


class SaveData(BaseModel):
    incharge_bsit: str | None = None
    incharge_bscs: str | None = None
    director: str | None = None
    rows: list[RowData] = []


def clean(value):
    return (value or "").strip() or None


def row_dict(r):
    return {
        "exam_date": r.exam_date.isoformat() if r.exam_date else None,
        "subject": r.subject,
        "time_text": r.time_text,
        "venue": r.venue,
        "instructor": r.instructor,
        "duty": r.duty,
    }


def get_rows(db, datesheet_id):
    return (
        db.query(models.DatesheetRow)
        .filter(models.DatesheetRow.datesheet_id == datesheet_id)
        .order_by(models.DatesheetRow.position)
        .all()
    )


def summary(db, d):
    count = (
        db.query(models.DatesheetRow)
        .filter(models.DatesheetRow.datesheet_id == d.id)
        .count()
    )
    return {
        "id": d.id,
        "kind": d.kind,
        "term": d.term,
        "program": d.program,
        "semester": d.semester,
        "session": d.session,
        "section": d.section,
        "status": d.status,
        "department_id": d.department_id,
        "row_count": count,
    }


def detail(db, d):
    info = summary(db, d)
    info["incharge_bsit"] = d.incharge_bsit
    info["incharge_bscs"] = d.incharge_bscs
    info["director"] = d.director
    info["rows"] = [row_dict(r) for r in get_rows(db, d.id)]
    return info


def get_or_404(db, datesheet_id):
    d = db.query(models.Datesheet).filter(models.Datesheet.id == datesheet_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Datesheet not found")
    return d


def can_manage(user, d):
    if user.role == "Admin":
        return True
    return user.role in STAFF and d.department_id == user.department_id


def can_view(user, d):
    if can_manage(user, d):
        return True
    return d.status == "Published" and (
        d.department_id is None or d.department_id == user.department_id
    )


def norm(value):
    return (value or "").strip().lower()


def find_clashes(db, d, rows):
    others = (
        db.query(models.DatesheetRow, models.Datesheet)
        .join(models.Datesheet, models.Datesheet.id == models.DatesheetRow.datesheet_id)
        .filter(
            models.Datesheet.id != d.id,
            models.Datesheet.kind == d.kind,
            models.Datesheet.term == d.term,
        )
        .all()
    )
    clashes = []
    for r in rows:
        for o, other in others:
            if o.exam_date != r.exam_date or norm(o.time_text) != norm(r.time_text):
                continue
            when = r.exam_date.strftime("%d-%m-%Y") + " at " + (r.time_text or "")
            if norm(r.venue) and norm(r.venue) == norm(o.venue):
                clashes.append("Venue " + r.venue + " is already used on " + when)
            if norm(r.instructor) and norm(r.instructor) == norm(o.instructor):
                clashes.append(r.instructor + " already has an exam on " + when)
    return list(dict.fromkeys(clashes))


def semester_key(value):
    m = re.match(r"\s*(\d+)", value or "")
    return int(m.group(1)) if m else 99


@router.get("")
def list_datesheets(db: Session = Depends(get_db), user=Depends(require_roles(*STAFF))):
    query = db.query(models.Datesheet)
    if user.role != "Admin":
        query = query.filter(models.Datesheet.department_id == user.department_id)
    rows = query.order_by(models.Datesheet.id).all()
    return [summary(db, d) for d in rows]


@router.get("/pdf")
def department_pdf(
    kind: str = "Mid-term",
    term: str | None = None,
    department_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if kind not in KINDS:
        raise HTTPException(status_code=400, detail="Kind must be Mid-term or Final term")
    query = db.query(models.Datesheet).filter(models.Datesheet.kind == kind)
    if term:
        query = query.filter(models.Datesheet.term == term)
    if user.role == "Admin":
        if department_id is not None:
            query = query.filter(models.Datesheet.department_id == department_id)
    else:
        query = query.filter(
            or_(
                models.Datesheet.department_id.is_(None),
                models.Datesheet.department_id == user.department_id,
            )
        )
        if user.role not in STAFF:
            query = query.filter(models.Datesheet.status == "Published")
    sheets = query.all()
    if not sheets:
        raise HTTPException(status_code=404, detail="No " + kind + " datesheets found yet")
    sheets.sort(key=lambda d: (d.program, semester_key(d.semester), d.section))
    data = []
    for d in sheets:
        data.append(
            {
                "kind": d.kind,
                "term": d.term,
                "program": d.program,
                "semester": d.semester,
                "session": d.session,
                "section": d.section,
                "incharge_bsit": d.incharge_bsit,
                "incharge_bscs": d.incharge_bscs,
                "director": d.director,
                "rows": [
                    {
                        "exam_date": r.exam_date,
                        "subject": r.subject,
                        "time_text": r.time_text,
                        "venue": r.venue,
                        "instructor": r.instructor,
                        "duty": r.duty,
                    }
                    for r in get_rows(db, d.id)
                ],
            }
        )
    pdf = build_pdf(data)
    filename = kind.replace(" ", "_") + "_Datesheet_Department.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="' + filename + '"'},
    )


@router.post("")
def create_datesheet(
    data: DatesheetCreate,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    if data.kind not in KINDS:
        raise HTTPException(status_code=400, detail="Kind must be Mid-term or Final term")
    for value in (data.term, data.program, data.semester, data.session, data.section):
        if not value.strip():
            raise HTTPException(status_code=400, detail="Please fill in all the fields")
    if user.role == "Admin":
        department_id = data.department_id
    else:
        if user.department_id is None:
            raise HTTPException(status_code=400, detail="Your account has no department")
        department_id = user.department_id
    count = (
        db.query(models.Datesheet)
        .filter(models.Datesheet.department_id == department_id)
        .count()
    )
    if count >= MAX_PER_DEPARTMENT:
        raise HTTPException(
            status_code=400,
            detail="A department can have at most " + str(MAX_PER_DEPARTMENT) + " datesheets",
        )
    d = models.Datesheet(
        department_id=department_id,
        kind=data.kind,
        term=data.term.strip(),
        program=data.program.strip(),
        semester=data.semester.strip(),
        session=data.session.strip(),
        section=data.section.strip(),
        status="Draft",
        created_by=user.id,
    )
    if data.copy_from:
        source = get_or_404(db, data.copy_from)
        if not can_view(user, source):
            raise HTTPException(status_code=403, detail="You cannot copy that datesheet")
        d.incharge_bsit = source.incharge_bsit
        d.incharge_bscs = source.incharge_bscs
        d.director = source.director
    db.add(d)
    db.commit()
    db.refresh(d)
    if data.copy_from:
        for r in get_rows(db, data.copy_from):
            db.add(
                models.DatesheetRow(
                    datesheet_id=d.id,
                    position=r.position,
                    exam_date=r.exam_date,
                    subject=r.subject,
                    time_text=r.time_text,
                    venue=r.venue,
                    instructor=r.instructor,
                    duty=r.duty,
                )
            )
        db.commit()
    return summary(db, d)


@router.get("/published")
def list_published(db: Session = Depends(get_db), user=Depends(get_current_user)):
    query = db.query(models.Datesheet).filter(models.Datesheet.status == "Published")
    if user.role != "Admin":
        query = query.filter(
            or_(
                models.Datesheet.department_id.is_(None),
                models.Datesheet.department_id == user.department_id,
            )
        )
    return [summary(db, d) for d in query.order_by(models.Datesheet.id).all()]


@router.get("/{datesheet_id}")
def get_datesheet(
    datesheet_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    d = get_or_404(db, datesheet_id)
    if not can_view(user, d):
        raise HTTPException(status_code=403, detail="You are not allowed to see this datesheet")
    return detail(db, d)


@router.put("/{datesheet_id}")
def save_datesheet(
    datesheet_id: int,
    data: SaveData,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    d = get_or_404(db, datesheet_id)
    if not can_manage(user, d):
        raise HTTPException(status_code=403, detail="You cannot edit this datesheet")
    if len(data.rows) > MAX_ROWS:
        raise HTTPException(status_code=400, detail="At most " + str(MAX_ROWS) + " rows")
    rows = []
    for i, r in enumerate(data.rows, 1):
        if not r.subject.strip():
            raise HTTPException(status_code=400, detail="Row " + str(i) + " needs a subject")
        rows.append(
            models.DatesheetRow(
                datesheet_id=d.id,
                position=i,
                exam_date=r.exam_date,
                subject=r.subject.strip(),
                time_text=clean(r.time_text),
                venue=clean(r.venue),
                instructor=clean(r.instructor),
                duty=clean(r.duty),
            )
        )
    clashes = find_clashes(db, d, rows)
    if clashes:
        raise HTTPException(status_code=409, detail="; ".join(clashes))
    d.incharge_bsit = clean(data.incharge_bsit)
    d.incharge_bscs = clean(data.incharge_bscs)
    d.director = clean(data.director)
    db.query(models.DatesheetRow).filter(models.DatesheetRow.datesheet_id == d.id).delete()
    db.add_all(rows)
    db.commit()
    return detail(db, d)


@router.post("/{datesheet_id}/publish")
def publish_datesheet(
    datesheet_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    d = get_or_404(db, datesheet_id)
    if not can_manage(user, d):
        raise HTTPException(status_code=403, detail="You cannot publish this datesheet")
    if len(get_rows(db, d.id)) == 0:
        raise HTTPException(status_code=400, detail="Add at least one row before publishing")
    d.status = "Published"
    db.commit()
    return summary(db, d)


@router.post("/{datesheet_id}/unpublish")
def unpublish_datesheet(
    datesheet_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    d = get_or_404(db, datesheet_id)
    if not can_manage(user, d):
        raise HTTPException(status_code=403, detail="You cannot change this datesheet")
    d.status = "Draft"
    db.commit()
    return summary(db, d)


@router.delete("/{datesheet_id}")
def delete_datesheet(
    datesheet_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    d = get_or_404(db, datesheet_id)
    if not can_manage(user, d):
        raise HTTPException(status_code=403, detail="You cannot delete this datesheet")
    db.query(models.DatesheetRow).filter(models.DatesheetRow.datesheet_id == d.id).delete()
    db.delete(d)
    db.commit()
    return {"deleted": datesheet_id}
