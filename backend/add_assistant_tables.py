# Creates the two chat tables only if they do not exist. Nothing else is touched.
import models
from database import engine

models.AssistantChat.__table__.create(engine, checkfirst=True)
models.AssistantMessage.__table__.create(engine, checkfirst=True)

print("assistant_chats and assistant_messages are ready")
