from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import os, uuid

from backend.firebase import db  # Firestore handle

router = APIRouter()

# ===== Models (kept) =====
class LabelInput(BaseModel):
    filename: str
    label: str
    confidence: float

# ===== Folder setup =====
UPLOAD_DIR = "uploaded_audios"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ===== Predict (stub) =====
@router.post("/predict")
async def predict_audio(file: UploadFile = File(...)):
    return {"filename": file.filename, "predicted_label": "Bullfrog", "confidence": 0.92}

# ===== Label (stub) =====
@router.post("/label")
async def label_audio(data: LabelInput):
    return {"message": "Label received", "data": data}

# ===== Upload audio (Task 10.5) =====
@router.post("/upload-audio", summary="Upload Audio")
async def upload_audio(
    userId: str = Form(...),
    species: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    audio_file: UploadFile = File(...),
):
    if not (audio_file.content_type or "").startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be an audio type")

    # Save file to disk with a unique name
    ext = os.path.splitext(audio_file.filename or "")[1] or ".wav"
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(await audio_file.read())

    # Create Firestore recording doc
    recording_id = f"rec_{uuid.uuid4().hex[:8]}"
    now_iso = datetime.utcnow().isoformat() + "Z"

    doc = {
        "recordingId": recording_id,
        "userId": userId,
        "species": species or "",
        "predictedSpecies": "",
        "audioURL": f"/get-audio/{filename}",
        "location": {"lat": latitude, "lng": longitude},
        "status": "pending_analysis",          # <- key for ML handoff later
        "timestamp": now_iso,
        "duration": None,
        "confidenceScore": None,
        "expertLabel": "",
        "history": [
            {"action": "submitted", "actorId": userId, "timestamp": now_iso}
        ],
        "fileName": filename,
        "filePath": path,
        "contentType": audio_file.content_type,
    }

    db.collection("recordings").document(recording_id).set(doc)

    return {"message": "Audio uploaded", "recordingId": recording_id, "file": filename}

# ===== Serve audio back =====
@router.get("/get-audio/{filename}", summary="Get Audio")
def get_audio(filename: str):
    path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="application/octet-stream", filename=filename)
