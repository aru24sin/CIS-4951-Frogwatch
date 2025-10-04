# backend/app/routes/recordings.py
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, status, Query, Body
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Dict, Any, List
import uuid
import logging

from backend.utils.roles import get_user_role
from backend import firebase
from .auth import get_current_user

# Setup logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

CurrentUser = Dict[str, Any]
router = APIRouter(prefix="/recordings", tags=["Recordings"])


# ------------------ Pydantic Models ------------------
class Recording(BaseModel):
    recordingId: str
    userId: str
    species: str = ""
    predictedSpecies: str = ""
    audioURL: str
    location: Dict[str, float] = {}
    status: str = "pending"
    timestamp: str


class ReviewPayload(BaseModel):
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    notes: Optional[str] = Field(None, example="Audio was clear but background noise present")


# ------------------ Helpers ------------------
def normalize_timestamp(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Firestore datetime/timestamp fields to ISO string for responses"""
    if "timestamp" in doc:
        ts = doc["timestamp"]
        if isinstance(ts, datetime):
            doc["timestamp"] = ts.isoformat()
        else:
            try:
                # Handle Firestore Timestamp object
                doc["timestamp"] = ts.isoformat()
            except Exception:
                doc["timestamp"] = str(ts)
    return doc


# ------------------ Upload Audio ------------------
@router.post("/upload-audio")
async def upload_audio(
    userId: str = Form(...),
    species: Optional[str] = Form(""),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    audio_file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    role = get_user_role(user["uid"])
    if role not in ["volunteer", "expert", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to upload recordings")

    if userId != user["uid"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed for this userId")

    try:
        recording_id = str(uuid.uuid4())
        ext = "." + audio_file.filename.rsplit(".", 1)[-1].lower() if audio_file.filename and "." in audio_file.filename else ".wav"
        filename = f"recordings/{recording_id}{ext}"

        bucket = firebase.storage.bucket()
        blob = bucket.blob(filename)
        blob.upload_from_file(audio_file.file, content_type=audio_file.content_type)
        audio_url = blob.public_url

        metadata = Recording(
            recordingId=recording_id,
            userId=userId,
            species=species or "",
            predictedSpecies="",
            audioURL=audio_url,
            location=({"lat": latitude, "lng": longitude} if latitude and longitude else {}),
            status="pending",
            timestamp=datetime.utcnow().isoformat(),
        )

        data = metadata.dict()
        data["createdBy"] = metadata.userId
        firebase.db.collection("recordings").document(recording_id).set(data)

        logger.info(f"Audio uploaded: {recording_id}")
        return {"message": "Audio uploaded successfully", "recordingId": recording_id, "audioURL": audio_url}

    except Exception as e:
        logger.exception("Error uploading audio")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")


# ------------------ Create Recording ------------------
@router.post("")
async def create_recording(recording: Recording, user: CurrentUser = Depends(get_current_user)):
    role = get_user_role(user["uid"])
    if role not in ["volunteer", "expert", "admin"]:
        raise HTTPException(status_code=403, detail="Not allowed to create recordings")

    if recording.userId != user["uid"]:
        raise HTTPException(status_code=403, detail="Not allowed for this userId")

    data = recording.dict()
    data["createdBy"] = recording.userId
    firebase.db.collection("recordings").document(recording.recordingId).set(data)
    logger.info(f"Recording created: {recording.recordingId}")
    return {"message": "Recording added successfully"}


# ------------------ List Recordings ------------------
@router.get("/my")
async def my_recordings(user: CurrentUser = Depends(get_current_user)):
    q = firebase.db.collection("recordings").where("userId", "==", user["uid"]).stream()
    return [normalize_timestamp(d.to_dict()) for d in q]


@router.get("/user/{user_id}")
async def get_recordings_by_user(user_id: str, user: CurrentUser = Depends(get_current_user)):
    if get_user_role(user["uid"]) != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view other users’ recordings")

    q = firebase.db.collection("recordings").where("userId", "==", user_id).stream()
    results = [normalize_timestamp(d.to_dict()) for d in q]
    if not results:
        raise HTTPException(status_code=404, detail="No recordings found for this user")
    return results


@router.get("/pending")
def list_pending_recordings(user=Depends(get_current_user)):
    if get_user_role(user["uid"]) not in ["expert", "admin"]:
        raise HTTPException(status_code=403, detail="Not allowed")

    q = firebase.db.collection("recordings").where("status", "==", "pending").stream()
    return [normalize_timestamp(d.to_dict()) for d in q]


@router.get("/review-queue")
def review_queue(user=Depends(get_current_user)):
    if get_user_role(user["uid"]) not in ["expert", "admin"]:
        raise HTTPException(status_code=403, detail="Not allowed")

    q = firebase.db.collection("recordings").where("status", "==", "pending").stream()
    return [normalize_timestamp(d.to_dict()) for d in q]


@router.get("/all")
def list_all_recordings(
    role_filter: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    user=Depends(get_current_user)
):
    if get_user_role(user["uid"]) != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view all recordings")

    q = firebase.db.collection("recordings")
    if role_filter:
        q = q.where("role", "==", role_filter)
    if status_filter:
        q = q.where("status", "==", status_filter)

    return [normalize_timestamp(d.to_dict()) for d in q.stream()]


@router.get("/reviewed")
def list_reviewed_recordings(user=Depends(get_current_user)):
    if get_user_role(user["uid"]) not in ["expert", "admin"]:
        raise HTTPException(status_code=403, detail="Not allowed")

    q = firebase.db.collection("recordings").where("reviewedBy", "==", user["uid"]).stream()
    return [normalize_timestamp(d.to_dict()) for d in q]


# ------------------ Download Recording ------------------
@router.get("/download/{recording_id}")
def download_recording(recording_id: str, user: CurrentUser = Depends(get_current_user)):
    doc = firebase.db.collection("recordings").document(recording_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Recording not found")

    data = doc.to_dict()
    if data.get("userId") != user["uid"] and get_user_role(user["uid"]) != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to download this recording")

    url = data.get("audioURL")
    if not url:
        raise HTTPException(status_code=400, detail="Recording URL not available")
    return {"downloadUrl": url}


# ------------------ Get Single Recording ------------------
@router.get("/{recording_id}")
async def get_recording(recording_id: str, user: CurrentUser = Depends(get_current_user)):
    doc = firebase.db.collection("recordings").document(recording_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Recording not found")

    data = doc.to_dict()
    if data.get("userId") != user["uid"] and get_user_role(user["uid"]) != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to view this recording")

    return normalize_timestamp(data)


# ------------------ Approve / Reject Recording ------------------
@router.post("/{recording_id}/approve")
async def approve_recording(recording_id: str, payload: ReviewPayload = Body(...), user: CurrentUser = Depends(get_current_user)):
    if get_user_role(user["uid"]) not in ["expert", "admin"]:
        raise HTTPException(status_code=403, detail="Only experts or admins can approve recordings")

    doc_ref = firebase.db.collection("recordings").document(recording_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Recording not found")

    update_data = {
        "status": "approved",
        "reviewedBy": user["uid"],
        "reviewNotes": payload.notes or "",
        "reviewedAt": datetime.utcnow()
    }
    if payload.confidence is not None:
        update_data["confidence"] = float(payload.confidence)

    try:
        doc_ref.update(update_data)
        logger.info(f"Approved recording {recording_id} with: {update_data}")
        return {"message": f"Recording {recording_id} approved"}
    except Exception as e:
        logger.exception("Failed to approve recording")
        raise HTTPException(status_code=500, detail=f"Firestore update failed: {e}")


@router.post("/{recording_id}/reject")
async def reject_recording(recording_id: str, payload: ReviewPayload = Body(...), user: CurrentUser = Depends(get_current_user)):
    if get_user_role(user["uid"]) not in ["expert", "admin"]:
        raise HTTPException(status_code=403, detail="Only experts or admins can reject recordings")

    doc_ref = firebase.db.collection("recordings").document(recording_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Recording not found")

    update_data = {
        "status": "rejected",
        "reviewedBy": user["uid"],
        "reviewNotes": payload.notes or "",
        "reviewedAt": datetime.utcnow()
    }
    if payload.confidence is not None:
        update_data["confidence"] = float(payload.confidence)

    try:
        doc_ref.update(update_data)
        logger.info(f"Rejected recording {recording_id} with: {update_data}")
        return {"message": f"Recording {recording_id} rejected"}
    except Exception as e:
        logger.exception("Failed to reject recording")
        raise HTTPException(status_code=500, detail=f"Firestore update failed: {e}")


# ------------------ Delete Recording (Admin Only) ------------------
@router.delete("/{recording_id}")
async def delete_recording(recording_id: str, user: CurrentUser = Depends(get_current_user)):
    if get_user_role(user["uid"]) != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete recordings")

    try:
        firebase.db.collection("recordings").document(recording_id).delete()
        logger.info(f"Recording {recording_id} deleted")
        return {"message": "Recording deleted"}
    except Exception as e:
        logger.exception("Failed to delete recording")
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")  