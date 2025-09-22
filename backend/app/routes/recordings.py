from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, status
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any
import uuid

from backend import firebase
from .auth import get_current_user

# This type represents the current authenticated user's info
CurrentUser = Dict[str, Any]

router = APIRouter(prefix="/recordings", tags=["recordings"])

class Recording(BaseModel):
    recordingId: str
    userId: str
    species: str = ""
    predictedSpecies: str = ""
    audioURL: str
    location: Dict[str, float] = {}
    status: str = "pending_analysis"
    timestamp: str

@router.post("/upload-audio")
async def upload_audio(
    userId: str = Form(...),
    species: Optional[str] = Form(""),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    audio_file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    if userId != user["uid"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this userId")

    try:
        recording_id = str(uuid.uuid4())

        ext = ""
        if audio_file.filename and "." in audio_file.filename:
            ext = "." + audio_file.filename.rsplit(".", 1)[-1].lower()
        filename = f"recordings/{recording_id}{ext or '.wav'}"

        bucket = firebase.storage.bucket()
        blob = bucket.blob(filename)
        blob.upload_from_file(audio_file.file, content_type=audio_file.content_type)
        audio_url = blob.public_url

        metadata: Recording = Recording(
            recordingId=recording_id,
            userId=userId,
            species=species or "",
            predictedSpecies="",
            audioURL=audio_url,
            location=({"lat": latitude, "lng": longitude} if latitude is not None and longitude is not None else {}),
            status="pending_analysis",
            timestamp=datetime.utcnow().isoformat(),
        )

        data = metadata.dict()
        data["createdBy"] = metadata.userId
        firebase.db.collection("recordings").document(recording_id).set(data)

        return {
            "message": "Audio uploaded successfully",
            "recordingId": recording_id,
            "audioURL": audio_url,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

@router.get("")
async def list_my_recordings(user: CurrentUser = Depends(get_current_user)):
    q = firebase.db.collection("recordings").where("userId", "==", user["uid"]).stream()
    return [doc.to_dict() for doc in q]

@router.post("")
async def create_recording(recording: Recording, user: CurrentUser = Depends(get_current_user)):
    if recording.userId != user["uid"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this userId")

    data = recording.dict()
    data["createdBy"] = recording.userId
    firebase.db.collection("recordings").document(recording.recordingId).set(data)
    return {"message": "Recording added successfully"}

@router.get("/download/{recording_id}")
def download_recording(recording_id: str, user: CurrentUser = Depends(get_current_user)):
    doc = firebase.db.collection("recordings").document(recording_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Recording not found")
    data = doc.to_dict()

    if data.get("userId") != user["uid"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this recording")

    url = data.get("audioURL")
    if not url:
        raise HTTPException(status_code=400, detail="Recording URL not available")
    return {"downloadUrl": url}

@router.get("/user/{user_id}")
async def get_recordings_by_user(user_id: str, user: CurrentUser = Depends(get_current_user)):
    q = firebase.db.collection("recordings").where("userId", "==", user_id).stream()
    results = [doc.to_dict() for doc in q]
    if not results:
        raise HTTPException(status_code=404, detail="No recordings found for this user")
    return results

@router.get("/my")
async def my_recordings(user: CurrentUser = Depends(get_current_user)):
    q = firebase.db.collection("recordings").where("userId", "==", user["uid"]).stream()
    return [doc.to_dict() for doc in q]

# ------------------  NEW ENDPOINT (Task 12.2)  ------------------

@router.get("/{recording_id}")
async def get_recording(recording_id: str, user: CurrentUser = Depends(get_current_user)):
    """
    Return full metadata for a single recording.
    Only owner or admin can view it.
    """
    doc = firebase.db.collection("recordings").document(recording_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Recording not found")
    data = doc.to_dict()
    if data.get("userId") != user["uid"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to view this recording")
    return data
