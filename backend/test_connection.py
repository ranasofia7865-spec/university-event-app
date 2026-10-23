from sqlalchemy import text
from database import engine

with engine.connect() as conn:
       print(conn.execute(text("select 1")).scalar(), "Connected to event_app")