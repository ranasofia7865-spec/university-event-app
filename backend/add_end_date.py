from sqlalchemy import text
from database import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date DATE"))

print("end_date column added")
