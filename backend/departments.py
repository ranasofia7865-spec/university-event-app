from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from auth import get_db, get_current_user, require_roles

router = APIRouter(prefix="/departments", tags=["departments"])


class DepartmentData(BaseModel):
    name: str


@router.get("")
def list_departments(db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = db.query(models.Department).order_by(models.Department.name).all()
    return [{"id": d.id, "name": d.name} for d in rows]


@router.post("")
def create_department(
    data: DepartmentData,
    db: Session = Depends(get_db),
    user=Depends(require_roles("Admin")),
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    exists = db.query(models.Department).filter(models.Department.name == name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Department already exists")
    dept = models.Department(name=name)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return {"id": dept.id, "name": dept.name}


@router.put("/{dept_id}")
def rename_department(
    dept_id: int,
    data: DepartmentData,
    db: Session = Depends(get_db),
    user=Depends(require_roles("Admin")),
):
    dept = db.query(models.Department).filter(models.Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    dept.name = name
    db.commit()
    return {"id": dept.id, "name": dept.name}
