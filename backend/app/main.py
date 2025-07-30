from fastapi import FastAPI
from .routes import audio, users, recordings, approvals, feedback
import backend.firebase

app = FastAPI()
# Initialize Firebase
app.include_router(audio.router)
app.include_router(users.router)
app.include_router(recordings.router)
app.include_router(approvals.router)
app.include_router(feedback.router)


@app.get("/")
def read_root():
    return {"message": "FrogWatch Backend is running!"}
