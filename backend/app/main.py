# backend/app/main.py
from fastapi import FastAPI, Depends
from fastapi.security import HTTPBearer
from dotenv import load_dotenv

# Load env first
load_dotenv()

# initializes firebase_admin
import backend.firebase

# Routers
from backend.app.routes import audio, users, recordings, approvals, feedback, email, auth, model

# 👇 This makes Swagger show lock icon + handle Authorization header automatically
security = HTTPBearer()

app = FastAPI(title="FrogWatch Backend")

# Public/unprotected routes (auth only)
app.include_router(auth.router)

# Protected routes: user must come with a Bearer token
app.include_router(audio.router, dependencies=[Depends(security)])
app.include_router(users.router, dependencies=[Depends(security)])
app.include_router(recordings.router, dependencies=[Depends(security)])
app.include_router(approvals.router, dependencies=[Depends(security)])
app.include_router(feedback.router, dependencies=[Depends(security)])
app.include_router(email.router, dependencies=[Depends(security)])
app.include_router(model.router)

@app.get("/")
def read_root():
    return {"message": "FrogWatch Backend is running!"}
