from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from datetime import datetime
import os

router = APIRouter()

# Models
class LabelInput(BaseModel):
    filename: str
    label: str
    confidence: float

# Folder setup
UPLOAD_DIR = "uploaded_audios"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# /predict
@router.post("/predict")
async def predict_audio(file: UploadFile = File(...)):
    return {"filename": file.filename, "predicted_label": "Bullfrog", "confidence": 0.92}

# /label
@router.post("/label")
async def label_audio(data: LabelInput):
    return {"message": "Label received", "data": data}

# /upload audio
@router.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...), gps: str = Form(...), user_id: str = Form(...)):
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    save_path = os.path.join(UPLOAD_DIR, f"{user_id}_{timestamp}_{file.filename}")
    with open(save_path, "wb") as buffer:
        contents = await file.read()
        buffer.write(contents)
    return {
        "message": "Audio uploaded successfully",
        "filename": file.filename,
        "saved_as": save_path,
        "user_id": user_id,
        "gps": gps,
        "timestamp": timestamp
    }
# Serve audio file by filename
@router.get("/get-audio/{filename}")
def get_audio(filename: str):
    file_path = os.path.join("uploaded_audios", filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="audio/mpeg", filename=filename)
    return {"error": "File not found"}