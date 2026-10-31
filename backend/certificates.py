import re

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field

from auth import require_roles
from certificate_pdf import build_pdf

router = APIRouter(prefix="/certificates", tags=["certificates"])

STAFF = ("Admin", "Department Head", "Teacher")


class BonafideIn(BaseModel):
    student_name: str = Field("", max_length=80)
    father_name: str = Field("", max_length=80)
    roll_no: str = Field("", max_length=40)
    shift: str = Field("", max_length=20)
    program: str = Field("", max_length=20)
    session: str = Field("", max_length=20)
    section: str = Field("", max_length=10)
    semester: str = Field("", max_length=20)
    date_text: str = Field("", max_length=30)


@router.post("/bonafide/pdf")
def bonafide_pdf(body: BonafideIn, user=Depends(require_roles(*STAFF))):
    pdf = build_pdf(body.model_dump())
    name = re.sub(r"[^A-Za-z0-9]+", "_", body.student_name).strip("_") or "Student"
    filename = "Bonafide_" + name + ".pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="' + filename + '"'},
    )
