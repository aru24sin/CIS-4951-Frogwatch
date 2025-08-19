# backend/app/routes/ml.py
import os
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from backend.app.routes.ml_runtime import predict_file

router = APIRouter(prefix="/predict", tags=["ml"])

@router.post("")
async def predict_endpoint(
    file: UploadFile = File(...),
    lat: float | None = Form(None),
    lon: float | None = Form(None),
):
    # Save the incoming file to a temp path
    suffix = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    with NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # First attempt: load directly (librosa supports many formats if ffmpeg is present)
        name, conf, top3 = predict_file(tmp_path, topk=3)
    except Exception:
        # Fallback: convert to WAV if needed (e.g., m4a → wav)
        try:
            from pydub import AudioSegment
            wav_path = tmp_path + ".wav"
            AudioSegment.from_file(tmp_path).export(wav_path, format="wav")
            name, conf, top3 = predict_file(wav_path, topk=3)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Prediction failed: {e}") from e
        finally:
            try:
                os.remove(wav_path)
            except Exception:
                pass
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    return {
        "species": name,
        "confidence": conf,  # 0..1
        "top3": [{"species": s, "confidence": c} for s, c in top3],
        "lat": lat,
        "lon": lon,
    }
