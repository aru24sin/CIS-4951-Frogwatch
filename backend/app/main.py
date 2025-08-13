# backend/app/main.py
from fastapi import FastAPI
from dotenv import load_dotenv

# Load env first
load_dotenv()

# backend/firebase.py initializes firebase_admin
import backend.firebase  # side-effect init 

# Routers   
from backend.app.routes import audio, users, recordings, approvals, feedback, email, auth


app = FastAPI(title="FrogWatch Backend")

# Mount each router exactly once
app.include_router(audio.router)
app.include_router(users.router)
app.include_router(recordings.router)
app.include_router(approvals.router)
app.include_router(feedback.router)
app.include_router(email.router)
app.include_router(auth.router)

@app.get("/")
def read_root():
    return {"message": "FrogWatch Backend is running!"}
