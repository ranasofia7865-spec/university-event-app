from database import SessionLocal
import models

TEMPLATES = [
    ("Notification", "General notice",
     "Dear {audience}, {message}. Date: {date}. Time: {time}. Venue: {venue}."),
    ("FYP", "FYP proposal defense notice",
     "Dear {department} students, the FYP proposal defense will be held on {date} at {time} in {venue}. Please submit your proposal by {deadline}."),
    ("Midterm", "Midterm exam notice",
     "Dear {department}, midterm examinations for {subject} will start on {date} at {time} in {room}."),
    ("Final term", "Final term exam notice",
     "Dear {department}, final term examinations for {subject} will start on {date} at {time} in {room}."),
    ("Schedule", "Event schedule notice",
     "Dear {audience}, the {event} is scheduled on {date} from {start_time} to {end_time} at {venue}."),
    ("Rescheduled", "Rescheduled notice",
     "Dear {audience}, {event} has been rescheduled from {old_date} to {new_date}. Please note the new date."),
]

db = SessionLocal()
added = 0
for kind, name, content in TEMPLATES:
    exists = db.query(models.Template).filter(models.Template.name == name).first()
    if exists:
        continue
    db.add(models.Template(type=kind, name=name, content=content))
    added += 1
db.commit()
db.close()
print("Added " + str(added) + " templates")
