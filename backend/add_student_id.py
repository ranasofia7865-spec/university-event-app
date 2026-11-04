from sqlalchemy import text
from database import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS student_id VARCHAR(50)"))

print("student_id column added")
