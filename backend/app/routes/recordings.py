from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend import firebase
from datetime import datetime
from typing import List

router = APIRouter()

# Recording model
class Recording(BaseModel):
    recordingId: str
    userId: str
    species: str
    predictedSpecies: str
    audioURL: str
    location: dict
    status: str
    timestamp: str

# GET all recordings
@router.get("/recordings")
async def get_recordings():
    recordings_ref = firebase.db.collection("recordings")
    docs = recordings_ref.stream()
    recordings = [doc.to_dict() for doc in docs]
    return recordings

# POST a new recording
@router.post("/recordings")
async def create_recording(recording: Recording):
    doc_ref = firebase.db.collection("recordings").document(recording.recordingId)
    doc_ref.set(recording.dict())
    return {"message": "Recording added successfully"}
