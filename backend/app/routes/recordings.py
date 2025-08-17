from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, status
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any
import uuid

from backend import firebase
from .auth import get_current_user

# This type represents the current authenticated user's info
CurrentUser = Dict[str, Any]

# API router for all endpoints related to recordings
router = APIRouter(prefix="/recordings", tags=["recordings"])

# Model for a single recording document in Firestore
class Recording(BaseModel):
    recordingId: str
    userId: str
    species: str = ""
    predictedSpecies: str = ""
    audioURL: str
    location: Dict[str, float] = {}
    status: str = "pending_analysis"
    timestamp: str

# Endpoint to handle audio uploads from the app
@router.post("/upload-audio")
async def upload_audio(
    userId: str = Form(...),
    species: Optional[str] = Form(""),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    audio_file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    # Make sure the user is uploading for their own account
    if userId != user["uid"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this userId")

    try:
        # Generate a unique ID for the recording
        recording_id = str(uuid.uuid4())

        # Keep the file extension if provided
        ext = ""
        if audio_file.filename and "." in audio_file.filename:
            ext = "." + audio_file.filename.rsplit(".", 1)[-1].lower()
        filename = f"recordings/{recording_id}{ext or '.wav'}"

        # Upload the audio file to Firebase Storage
        bucket = firebase.storage.bucket()
        blob = bucket.blob(filename)
        blob.upload_from_file(audio_file.file, content_type=audio_file.content_type)
        audio_url = blob.public_url

        # Build the recording metadata object
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

        # Save metadata to Firestore
        firebase.db.collection("recordings").document(recording_id).set(metadata.dict())

        return {"message": "Audio uploaded successfully", "recordingId": recording_id, "audioURL": audio_url}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

# Endpoint to list all recordings for the current authenticated user
@router.get("")
async def list_my_recordings(user: CurrentUser = Depends(get_current_user)):
    q = firebase.db.collection("recordings").where("userId", "==", user["uid"]).stream()
    return [doc.to_dict() for doc in q]

# Endpoint to create a new recording document directly (JSON request body)
@router.post("")
async def create_recording(recording: Recording, user: CurrentUser = Depends(get_current_user)):
    # Only allow creation if the recording belongs to the current user
    if recording.userId != user["uid"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this userId")
    firebase.db.collection("recordings").document(recording.recordingId).set(recording.dict())
    return {"message": "Recording added successfully"}

# Endpoint to get the download URL for a specific recording
@router.get("/download/{recording_id}")
def download_recording(recording_id: str, user: CurrentUser = Depends(get_current_user)):
    doc = firebase.db.collection("recordings").document(recording_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Recording not found")
    data = doc.to_dict()

    # Only the owner can download their recording
    if data.get("userId") != user["uid"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this recording")

    url = data.get("audioURL")
    if not url:
        raise HTTPException(status_code=400, detail="Recording URL not available")
    return {"downloadUrl": url}

# Endpoint to fetch recordings by a specific user ID
@router.get("/user/{user_id}")
async def get_recordings_by_user(user_id: str, user: CurrentUser = Depends(get_current_user)):
    q = firebase.db.collection("recordings").where("userId", "==", user_id).stream()
    results = [doc.to_dict() for doc in q]
    if not results:
        raise HTTPException(status_code=404, detail="No recordings found for this user")
    return results

# Endpoint: convenience shortcut for the current user
@router.get("/my")
async def my_recordings(user: CurrentUser = Depends(get_current_user)):
    """
    Return only the recordings uploaded by the currently logged-in user.
    Same as /recordings but doesn't require userId/client-side filtering.
    """
    q = firebase.db.collection("recordings").where("userId", "==", user["uid"]).stream()
    return [doc.to_dict() for doc in q]
