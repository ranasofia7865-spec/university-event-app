import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from auth import get_db, hash_password, require_roles

router = APIRouter(prefix="/students", tags=["students"])

MAX_ROWS = 300  # each password is hashed on purpose slowly, so keep one file small
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class StudentRow(BaseModel):
    line: int = 0
    email: str = ""
    full_name: str = ""
    student_id: str = ""


class ImportIn(BaseModel):
    rows: list[StudentRow]
    department_id: int | None = None
    dry_run: bool = True


def check_rows(rows, existing_emails, existing_ids):
    """Returns (good_rows, skipped). Nothing is written here."""
    good = []
    skipped = []
    seen_emails = set()
    seen_ids = set()
    for r in rows:
        email = (r.email or "").strip().lower()
        name = (r.full_name or "").strip()
        sid = (r.student_id or "").strip()
        reason = None
        if not email and not name and not sid:
            continue  # empty line
        if not email or not EMAIL_RE.match(email):
            reason = "Email is missing or not valid"
        elif not name:
            reason = "Full Name is missing"
        elif not sid:
            reason = "Student ID is missing"
        elif len(sid) < 4:
            reason = "Student ID is too short (it is the first password, minimum 4)"
        elif len(email) > 150 or len(name) > 100 or len(sid) > 50:
            reason = "A value is too long"
        elif email in existing_emails:
            reason = "Email is already registered"
        elif sid in existing_ids:
            reason = "Student ID is already used"
        elif email in seen_emails:
            reason = "Email appears twice in this file"
        elif sid in seen_ids:
            reason = "Student ID appears twice in this file"
        if reason:
            skipped.append({"line": r.line, "email": email or (r.email or ""), "reason": reason})
            continue
        seen_emails.add(email)
        seen_ids.add(sid)
        good.append({"line": r.line, "email": email, "name": name, "student_id": sid})
    return good, skipped


@router.post("/import")
def import_students(
    body: ImportIn,
    db: Session = Depends(get_db),
    user=Depends(require_roles("Admin", "Department Head")),
):
    if len(body.rows) == 0:
        raise HTTPException(status_code=400, detail="The file has no student rows")
    if len(body.rows) > MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail="Too many rows (" + str(len(body.rows)) + "). Maximum is " + str(MAX_ROWS) + " per file. Split the file.",
        )

    if user.role == "Department Head":
        if user.department_id is None:
            raise HTTPException(status_code=400, detail="Your account has no department")
        dept_id = user.department_id
    else:
        dept_id = body.department_id
        if dept_id is not None:
            if not db.query(models.Department).filter(models.Department.id == dept_id).first():
                raise HTTPException(status_code=400, detail="Department not found")

    existing_emails = {e.lower() for (e,) in db.query(models.User.email).all()}
    existing_ids = {
        s.strip()
        for (s,) in db.query(models.User.student_id).filter(models.User.student_id.isnot(None)).all()
    }
    good, skipped = check_rows(body.rows, existing_emails, existing_ids)

    created = 0
    if not body.dry_run:
        for g in good:
            db.add(
                models.User(
                    name=g["name"],
                    email=g["email"],
                    password=hash_password(g["student_id"]),
                    role="Student",
                    department_id=dept_id,
                    student_id=g["student_id"],
                )
            )
            created += 1
        db.commit()

    return {
        "dry_run": body.dry_run,
        "total": len(good) + len(skipped),
        "ok": len(good),
        "created": created,
        "skipped": skipped,
    }
