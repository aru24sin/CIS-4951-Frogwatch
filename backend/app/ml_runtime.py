from __future__ import annotations
import os, sys, time, tempfile, traceback
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse

# --- Paths / imports for Predictor + weights ---

ROUTE_DIR = Path(__file__).resolve().parent          # backend/app/routes
BACKEND_DIR = ROUTE_DIR.parent.parent                # backend
MODEL_DIR = BACKEND_DIR / "model"                    # backend/model

# so we can: from Predictor import ...
sys.path.append(str(MODEL_DIR))

from Predictor import from_pretrained, predict_one   # from backend/model/Predictor.py

# You can override this via env var on Cloud Run if needed
MODEL_FILE = os.getenv("FROGNET_WEIGHTS", "frognet_head_maxprob_a3_k3.pth")

router = APIRouter(tags=["ML"])   # no prefix → we’ll define full paths on routes


print(f"[ml_runtime] loading model from {MODEL_DIR} / {MODEL_FILE}")
_model, _preprocess, _idx_to_class = from_pretrained(str(MODEL_DIR), filename=MODEL_FILE)
print(f"[ml_runtime] classes: {sorted(_idx_to_class.values())}")


def get_model():
    """Used by main.py warmup."""
    return _model


def _infer(local_path: str, topk: int = 3):
    t0 = time.perf_counter()
    name, conf, topk_out = predict_one(local_path, _model, _preprocess, _idx_to_class, topk=topk)
    return name, conf, topk_out, (time.perf_counter() - t0) * 1000.0


def _save_to_tmp(upload: UploadFile) -> str:
    suffix = Path(upload.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        data = upload.file.read()
        tmp.write(data)
        return tmp.name


@router.get("/health-ml")
def health_ml():
    return {"status": "ok"}


@router.post("/predict")
@router.post("/ml/predict")
async def predict_endpoint(
    file: Optional[UploadFile] = File(None),
    audio_url: Optional[str] = Form(None),
    topk: int = Form(3),
):
    """
    Unified ML endpoint:
      - POST /predict
      - POST /ml/predict

    Body (multipart/form-data):
      - file: audio file (wav, m4a, etc.)
      - topk: optional (default 3)
    """
    if not file and not audio_url:
        return JSONResponse({"error": "No audio provided"}, status_code=400)

    local_path: Optional[str] = None
    try:
        if file:
            local_path = _save_to_tmp(file)
        else:
            return JSONResponse(
                {"error": "audio_url not supported in this build"},
                status_code=400,
            )

        name, conf, topk_out, ms = _infer(local_path, topk=topk)
        return {
            "species": name,
            "confidence": round(float(conf), 4),
            "topk": [{"label": lbl, "p": float(p)} for (lbl, p) in topk_out],
            "inference_ms": round(ms, 1),
        }
    except Exception as e:
        # Full traceback to logs + client (for debugging)
        print("\n=== ML PREDICT TRACEBACK ===")
        traceback.print_exc()
        print("================================\n")

        return JSONResponse(
            {
                "error": f"{type(e).__name__}: {e}",
                "traceback": traceback.format_exc(),
            },
            status_code=500,
        )
    finally:
        if local_path and os.path.exists(local_path):
            try:
                os.remove(local_path)
            except Exception:
                pass
