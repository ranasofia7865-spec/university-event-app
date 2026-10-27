import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from auth import get_db, require_roles

router = APIRouter(prefix="/templates", tags=["templates"])

STAFF = ("Admin", "Department Head", "Teacher")
PLACEHOLDER = re.compile(r"\{(\w+)\}")


class TemplateData(BaseModel):
    type: str
    name: str
    content: str


class FillData(BaseModel):
    values: dict[str, str] = {}


def fields_of(content):
    return list(dict.fromkeys(PLACEHOLDER.findall(content)))


def to_dict(t):
    return {
        "id": t.id,
        "type": t.type,
        "name": t.name,
        "content": t.content,
        "fields": fields_of(t.content),
    }


def get_template_or_404(db, template_id):
    t = db.query(models.Template).filter(models.Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


@router.get("")
def list_templates(db: Session = Depends(get_db), user=Depends(require_roles(*STAFF))):
    rows = db.query(models.Template).order_by(models.Template.name).all()
    return [to_dict(t) for t in rows]


@router.post("")
def create_template(
    data: TemplateData,
    db: Session = Depends(get_db),
    user=Depends(require_roles("Admin")),
):
    if not data.name.strip() or not data.content.strip():
        raise HTTPException(status_code=400, detail="Name and content cannot be empty")
    t = models.Template(type=data.type.strip(), name=data.name.strip(), content=data.content)
    db.add(t)
    db.commit()
    db.refresh(t)
    return to_dict(t)


@router.put("/{template_id}")
def update_template(
    template_id: int,
    data: TemplateData,
    db: Session = Depends(get_db),
    user=Depends(require_roles("Admin")),
):
    t = get_template_or_404(db, template_id)
    if not data.name.strip() or not data.content.strip():
        raise HTTPException(status_code=400, detail="Name and content cannot be empty")
    t.type = data.type.strip()
    t.name = data.name.strip()
    t.content = data.content
    db.commit()
    db.refresh(t)
    return to_dict(t)


@router.post("/{template_id}/fill")
def fill_template(
    template_id: int,
    data: FillData,
    db: Session = Depends(get_db),
    user=Depends(require_roles(*STAFF)),
):
    t = get_template_or_404(db, template_id)
    text = t.content
    missing = []
    for field in fields_of(t.content):
        value = (data.values.get(field) or "").strip()
        if value:
            text = text.replace("{" + field + "}", value)
        else:
            missing.append(field)
    return {"template_id": t.id, "name": t.name, "text": text, "missing": missing}
