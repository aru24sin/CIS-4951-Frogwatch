from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from backend import firebase
from datetime import datetime
from typing import List, Optional, Dict
from backend.firebase import db

import uuid

router = APIRouter()

# ----- Models -----
class Recording(BaseModel):
    recordingId: str
    userId: str
    species: str
    predictedSpecies: str
    audioURL: str
    location: Dict[str, float]  # {"lat": ..., "lng": ...}
    status: str
    timestamp: str

# ----- 10.5 Receive audio & metadata from app -----
@router.post("/upload-audio")
async def upload_audio(
    userId: str = Form(...),
    species: Optional[str] = Form(""),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    audio_file: UploadFile = File(...)
):
    """
    Receives multipart/form-data containing:
      - audio_file: wav/mp3/etc
      - userId (required)
      - species (optional manual label)
      - latitude/longitude (optional)
    Stores file to Firebase Storage, writes metadata to Firestore,
    and marks status as 'pending_analysis' for ML handoff later.
    """
    try:
        # 1) Make a unique recording ID
        recording_id = str(uuid.uuid4())

        # 2) Upload to Firebase Storage
        bucket = firebase.storage.bucket()
        ext = ""
        if audio_file.filename and "." in audio_file.filename:
            ext = "." + audio_file.filename.rsplit(".", 1)[-1].lower()
        blob = bucket.blob(f"recordings/{recording_id}{ext or '.wav'}")
        blob.upload_from_file(audio_file.file, content_type=audio_file.content_type)
        audio_url = blob.public_url

        # 3) Build Firestore doc
        metadata = {
            "recordingId": recording_id,
            "userId": userId,
            "species": species or "",
            "predictedSpecies": "",
            "audioURL": audio_url,
            "location": {"lat": latitude, "lng": longitude} if latitude is not None and longitude is not None else {},
            "status": "pending_analysis",
            "timestamp": datetime.utcnow().isoformat()
        }

        # 4) Save to Firestore
        firebase.db.collection("recordings").document(recording_id).set(metadata)

        return {"message": "Audio uploaded successfully", "recordingId": recording_id, "audioURL": audio_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

# ----- GET all recordings -----
@router.get("/recordings")
async def get_recordings():
    recordings_ref = firebase.db.collection("recordings")
    docs = recordings_ref.stream()
    return [doc.to_dict() for doc in docs]

# ----- POST a new recording (JSON path; OK to keep) -----
@router.post("/recordings")
async def create_recording(recording: Recording):
    firebase.db.collection("recordings").document(recording.recordingId).set(recording.dict())
    return {"message": "Recording added successfully"}

# ----- Download URL by recording id (fixed key name) -----
@router.get("/recordings/download/{recording_id}")
def download_recording(recording_id: str):
    doc = firebase.db.collection("recordings").document(recording_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Recording not found")
    data = doc.to_dict()
    # your schema uses "audioURL" (capital URL)
    if "audioURL" not in data:
        raise HTTPException(status_code=400, detail="Recording URL not available")
    return {"downloadUrl": data["audioURL"]}

# ----- Recordings by user (History view) -----
@router.get("/recordings/user/{user_id}")
async def get_recordings_by_user(user_id: str):
    query = firebase.db.collection("recordings").where("userId", "==", user_id).stream()
    results = [doc.to_dict() for doc in query]
    if not results:
        raise HTTPException(status_code=404, detail="No recordings found for this user")
    return results