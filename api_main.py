# api_main.py
from __future__ import annotations
import os, sys, time, tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# --- Make sure we can import your Predictor.py without packages ---
ROOT = Path(__file__).parent
MODEL_DIR = ROOT / "backend" / "model"
sys.path.append(str(MODEL_DIR))          # so "from Predictor import ..." works

from Predictor import from_pretrained, predict_one  # uses your exact preprocessing/model

app = FastAPI(title="Frogwatch Inference API")

# CORS (dev: open to all; tighten in prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tiny request logging to help debug from the phone
@app.middleware("http")
async def log_requests(request, call_next):
    print(">>", request.method, request.url.path)
    start = time.perf_counter()
    try:
        resp = await call_next(request)
        return resp
    finally:
        dur = (time.perf_counter() - start) * 1000
        print(f"<< {request.method} {request.url.path} in {dur:.1f} ms")

@app.get("/health")
def health():
    return {"status": "ok"}

# Load your model ONCE at startup
print(f"[init] loading model from {MODEL_DIR}")
_model, _preprocess, _idx_to_class = from_pretrained(str(MODEL_DIR))
print(f"[init] classes: {sorted(_idx_to_class.values())}")

def _infer(local_path: str, topk: int = 3):
    t0 = time.perf_counter()
    name, conf, topk_out = predict_one(local_path, _model, _preprocess, _idx_to_class, topk=topk)
    ms = (time.perf_counter() - t0) * 1000.0
    return name, conf, topk_out, ms

def _save_to_tmp(upload: UploadFile) -> str:
    # keep extension if possible (helps some decoders)
    suffix = Path(upload.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        data = upload.file.read()  # NOTE: UploadFile is SpooledTemporaryFile; .read() is fine here
        tmp.write(data)
        return tmp.name

@app.post("/predict")
@app.post("/ml/predict")  # alias so your app can hit either
async def predict(
    file: Optional[UploadFile] = File(None),
    audio_url: Optional[str] = Form(None),
    topk: int = Form(3)
):
    """
    Send audio using multipart/form-data with a 'file' part.
    - For M4A (expo-av default): type 'audio/mp4' and name ending .m4a
    - For WAV: type 'audio/wav' and name ending .wav
    """
    if not file and not audio_url:
        return JSONResponse({"error": "No audio provided"}, status_code=400)

    local_path = None
    try:
        if file:
            local_path = _save_to_tmp(file)
        else:
            # Minimal URL support (optional): download to temp file
            # Keeping simple; recommend sending a file from the app.
            return JSONResponse({"error": "audio_url not supported in this build"}, status_code=400)

        name, conf, topk_out, ms = _infer(local_path, topk=topk)
        return {
            "species": name,
            "confidence": round(float(conf), 4),
            "topk": [{"label": lbl, "p": float(p)} for (lbl, p) in topk_out],
            "inference_ms": round(ms, 1),
        }
    except Exception as e:
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=500)
    finally:
        if local_path and os.path.exists(local_path):
            try:
                os.remove(local_path)
            except Exception:
                pass