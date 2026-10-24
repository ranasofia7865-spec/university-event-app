from datetime import date

from database import SessionLocal
import models

MOON = "Date depends on moon sighting. A separate notification will be issued."

EVENTS = [
    ("Fall Semester Starts (Running Sessions)", date(2026, 8, 24), None, "Event", ""),
    ("Fall Fee Submission Last Date (Running Sessions)", date(2026, 9, 8), None, "Deadline", ""),
    ("Fall Mid Term Exams (Running Sessions)", date(2026, 10, 12), date(2026, 10, 16), "Exam", ""),
    ("Fall Final Exams (Running Sessions)", date(2026, 12, 14), date(2026, 12, 18), "Exam", ""),
    ("Fall Results Declaration (Running Sessions)", date(2027, 1, 1), None, "Event", ""),
    ("PhD Thesis Submission Last Date (Fall)", date(2027, 3, 19), None, "Deadline", "Where applicable"),
    ("Fall Semester Starts (New Intake)", date(2026, 9, 28), None, "Event", ""),
    ("Fall Mid Term Exams (New Intake)", date(2026, 11, 16), date(2026, 11, 20), "Exam", ""),
    ("Fall Final Exams (New Intake)", date(2027, 1, 25), date(2027, 1, 29), "Exam", ""),
    ("Fall Results Declaration (New Intake)", date(2027, 2, 8), None, "Event", ""),
    ("Spring Semester Starts (Running Sessions)", date(2027, 1, 4), None, "Event", ""),
    ("Spring Fee Submission Last Date (Running Sessions)", date(2027, 1, 18), None, "Deadline", ""),
    ("Spring Mid Term Exams (Running Sessions)", date(2027, 2, 22), date(2027, 2, 26), "Exam", ""),
    ("Spring Final Exams (Running Sessions)", date(2027, 4, 26), date(2027, 4, 30), "Exam", ""),
    ("Spring Results Declaration (Running Sessions)", date(2027, 5, 14), None, "Event", ""),
    ("PhD Thesis Submission Last Date (Spring)", date(2027, 9, 13), None, "Deadline", "Where applicable"),
    ("Spring Semester Starts (New Intake)", date(2027, 2, 8), None, "Event", ""),
    ("Spring Fee Submission Last Date (New Intake)", date(2027, 2, 22), None, "Deadline", ""),
    ("Spring Mid Term Exams (New Intake)", date(2027, 4, 12), date(2027, 4, 16), "Exam", ""),
    ("Spring Final Exams (New Intake)", date(2027, 6, 14), date(2027, 6, 18), "Exam", ""),
    ("Spring Results Declaration (New Intake)", date(2027, 6, 28), None, "Event", ""),
    ("BS and ADP Thesis Submission Last Date", date(2027, 6, 14), None, "Deadline", ""),
    ("BS and ADP Viva Voce", date(2027, 6, 17), date(2027, 6, 21), "Exam", ""),
    ("BS and ADP Thesis Result Declaration", date(2027, 6, 25), None, "Event", ""),
    ("MS/M.Phil Thesis Submission Last Date", date(2027, 5, 10), None, "Deadline", ""),
    ("MS/M.Phil Viva Voce", date(2027, 5, 17), date(2027, 5, 21), "Exam", ""),
    ("MS/M.Phil Thesis Result Declaration", date(2027, 5, 31), None, "Event", ""),
    ("12 Rabi-ul-Awal", date(2026, 8, 26), None, "Holiday", MOON),
    ("Allama Iqbal Day", date(2026, 11, 9), None, "Holiday", ""),
    ("Winter Vacations", date(2026, 12, 28), date(2027, 1, 1), "Holiday", ""),
    ("Kashmir Day", date(2027, 2, 5), None, "Holiday", ""),
    ("Eid-ul-Fitr", date(2027, 3, 9), date(2027, 3, 12), "Holiday", MOON),
    ("Pakistan Day", date(2027, 3, 23), None, "Holiday", ""),
    ("Eid-ul-Adha", date(2027, 5, 17), date(2027, 5, 18), "Holiday", MOON),
    ("Youm-e-Takbeer", date(2027, 5, 28), None, "Holiday", ""),
]

db = SessionLocal()
admin = db.query(models.User).filter(models.User.role == "Admin").first()
if not admin:
    print("No Admin user found. Register an Admin first.")
else:
    added = 0
    skipped = 0
    for title, start, end, kind, desc in EVENTS:
        exists = (
            db.query(models.Event)
            .filter(models.Event.title == title, models.Event.event_date == start)
            .first()
        )
        if exists:
            skipped += 1
            continue
        db.add(
            models.Event(
                title=title,
                description=desc or None,
                event_date=start,
                end_date=end,
                event_type=kind,
                status="Scheduled",
                department_id=None,
                created_by=admin.id,
            )
        )
        added += 1
    db.commit()
    print(f"Added {added} events, skipped {skipped} duplicates")
db.close()
