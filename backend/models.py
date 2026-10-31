from datetime import datetime
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


class Timetable(Base):
    __tablename__ = "timetables"
    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"))
    program = Column(String(50), nullable=False)
    semester = Column(String(20), nullable=False)
    section = Column(String(20), nullable=False)
    term = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="Draft")
    created_by = Column(Integer, ForeignKey("users.id"))


class TimetableCourse(Base):
    __tablename__ = "timetable_courses"
    id = Column(Integer, primary_key=True, index=True)
    timetable_id = Column(Integer, ForeignKey("timetables.id"), nullable=False)
    code = Column(String(30), nullable=False)
    subject = Column(String(150), nullable=False)
    credit_hours = Column(String(20))
    faculty = Column(String(100))


class TimetableSlot(Base):
    __tablename__ = "timetable_slots"
    id = Column(Integer, primary_key=True, index=True)
    timetable_id = Column(Integer, ForeignKey("timetables.id"), nullable=False)
    day = Column(String(15), nullable=False)
    slot = Column(String(20), nullable=False)
    course_code = Column(String(30), nullable=False)
    room = Column(String(30))


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(30), nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(Text)
    department_id = Column(Integer, ForeignKey("departments.id"))
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)


class Datesheet(Base):
    __tablename__ = "datesheets"
    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"))
    kind = Column(String(20), nullable=False)
    term = Column(String(50), nullable=False)
    program = Column(String(50), nullable=False)
    semester = Column(String(20), nullable=False)
    session = Column(String(30), nullable=False)
    section = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False, default="Draft")
    incharge_bsit = Column(String(100))
    incharge_bscs = Column(String(100))
    director = Column(String(100))
    created_by = Column(Integer, ForeignKey("users.id"))


class DatesheetRow(Base):
    __tablename__ = "datesheet_rows"
    id = Column(Integer, primary_key=True, index=True)
    datesheet_id = Column(Integer, ForeignKey("datesheets.id"), nullable=False)
    position = Column(Integer)
    exam_date = Column(Date, nullable=False)
    subject = Column(String(200), nullable=False)
    time_text = Column(String(50))
    venue = Column(String(50))
    instructor = Column(String(100))
    duty = Column(String(100))
