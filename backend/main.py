from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

import models
from database import SessionLocal
from auth import hash_password, verify_password, create_token

app = FastAPI()
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])
import departments
app.include_router(departments.router)
import events
app.include_router(events.router)
import reminders
app.include_router(reminders.router)

ROLES = ["Admin", "Department Head", "Teacher", "Student"]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class RegisterData(BaseModel):
    name: str
    email: str
    password: str
    role: str
    department_id: int | None = None


class LoginData(BaseModel):
    email: str
    password: str


@app.get("/")
def home():
    return {"message": "University Event App is running"}


@app.post("/register")
def register(data: RegisterData, db: Session = Depends(get_db)):
    if data.role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        name=data.name,
        email=data.email,
        password=hash_password(data.password),
        role=data.role,
        department_id=data.department_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "name": user.name, "role": user.role}


@app.post("/login")
def login(data: LoginData, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or not verify_password(data.password, user.password):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    token = create_token(user.id, user.role)
    return {"token": token, "role": user.role, "name": user.name}
