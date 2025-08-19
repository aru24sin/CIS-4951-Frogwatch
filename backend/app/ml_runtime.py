# backend/app/routes/ml_runtime.py
from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, Form
from pathlib import Path
import os, shutil, tempfile

# ---- Import teammate's helpers (support several possible locations) ----
try:
    # If you placed the model code under backend/app/model
    from backend.app.model.Predictor import from_pretrained, predict_one
except ModuleNotFoundError:
    try:
        # If you placed it under backend/model
        from backend.model.Predictor import from_pretrained, predict_one
    except ModuleNotFoundError:
        # If you kept a top-level /model folder
        from model.Predictor import from_pretrained, predict_one  # type: ignore

router = APIRouter(prefix="/ml", tags=["ml"])

# ---- Resolve the model directory robustly ----
def _resolve_ckpt_dir() -> Path:
    # 1) explicit override
    env = os.getenv("FROG_MODEL_DIR")
    if env:
        return Path(env)

    here = Path(__file__).resolve()
    candidates = [
        here.parents[2] / "model",   # backend/model
        here.parents[3] / "model",   # repo_root/model
        Path.cwd() / "backend" / "model",
        Path.cwd() / "model",
    ]
    for p in candidates:
        if p.exists():
            return p
    # fallback to backend/model even if it doesn't exist (from_pretrained will raise)
    return here.parents[2] / "model"

CKPT_DIR = _resolve_ckpt_dir()

# ---- Lazy singletons ----
_model = None
_preprocess = None
_idx_to_class = None

def get_model():
    """Load the model once and cache it."""
    global _model, _preprocess, _idx_to_class
    if _model is None:
        _model, _preprocess, _idx_to_class = from_pretrained(str(CKPT_DIR))
    return _model, _preprocess, _idx_to_class

# ---- Plain function used by the HTTP layer (ml.py) ----
def predict_file(path: str, topk: int = 3):
    """
    Wrapper used by the /predict endpoint.
    Returns (name, confidence, topk_list).
    """
    model, preprocess, idx_to_class = get_model()
    try:
        # If your Predictor supports topk:
        return predict_one(path, model, preprocess, idx_to_class, topk=topk)  # type: ignore[arg-type]
    except TypeError:
        # Older signature (no topk arg)
        return predict_one(path, model, preprocess, idx_to_class)

# Optional route (only active if included in main)
@router.post("/predict")
async def predict(
    file: UploadFile = File(...),
    lat: float | None = Form(None),
    lon: float | None = Form(None),
):
    # Save uploaded audio to a temp file
    suffix = Path(file.filename or "").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        name, conf, top3 = predict_file(str(tmp_path), topk=3)
        return {
            "ok": True,
            "species": name,
            "confidence": conf,
            "top3": top3,
            "lat": lat,
            "lon": lon,
        }
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
