from sqlalchemy import Column, Integer, String, Text, Date, Time, DateTime, ForeignKey
from database import Base


class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), nullable=False, unique=True)
    password = Column(String(255), nullable=False)
    role = Column(String(30), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"))


class Template(Base):
    __tablename__ = "templates"
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)


class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    event_date = Column(Date, nullable=False)
    end_date = Column(Date)
    start_time = Column(Time)
    end_time = Column(Time)
    event_type = Column(String(30), nullable=False)
    status = Column(String(30), nullable=False, default="Scheduled")
    department_id = Column(Integer, ForeignKey("departments.id"))
    created_by = Column(Integer, ForeignKey("users.id"))
    template_id = Column(Integer, ForeignKey("templates.id"))


class Reminder(Base):
    __tablename__ = "reminders"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    remind_at = Column(DateTime, nullable=False)
    status = Column(String(30), nullable=False, default="Pending")
