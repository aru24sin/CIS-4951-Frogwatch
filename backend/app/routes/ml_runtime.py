# backend/app/routes/ml_runtime.py
from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pathlib import Path
import os
import shutil
import tempfile
import threading

# ----  (allow several possible locations) ----
try:
    # If model code lives under backend/app/model
    from backend.app.model.Predictor import from_pretrained, predict_one
except ModuleNotFoundError:
    try:
        # If model code lives under backend/model
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
        p = Path(env)
        if p.exists():
            return p

    here = Path(__file__).resolve()
    candidates = (
        here.parents[2] / "model",   # backend/model
        here.parents[3] / "model",   # repo_root/model
        Path.cwd() / "backend" / "model",
        Path.cwd() / "model",
    )
    for p in candidates:
        if p.exists():
            return p

    # fallback; from_pretrained will raise if missing
    return here.parents[2] / "model"

CKPT_DIR = _resolve_ckpt_dir()

# ---- Lazy singletons + lock (thread-safe) ----
_model = None
_preprocess = None
_idx_to_class = None
_model_lock = threading.Lock()

def get_model():
    """Load the model once and cache it (thread-safe)."""
    global _model, _preprocess, _idx_to_class
    if _model is not None:
        return _model, _preprocess, _idx_to_class

    with _model_lock:
        if _model is None:
            if not CKPT_DIR.exists():
                raise RuntimeError(
                    f"Model folder not found at {CKPT_DIR}. "
                    "Set FROG_MODEL_DIR or place model files under backend/model."
                )
            _model, _preprocess, _idx_to_class = from_pretrained(str(CKPT_DIR))
    return _model, _preprocess, _idx_to_class

# ---- Plain function used by the HTTP layer (ml.py) ----
def predict_file(path: str, topk: int = 3):
    """
    Wrapper used by the /predict endpoint.
    Always returns (name: str, confidence: float, topk_list: list[tuple[str, float]]).
    """
    model, preprocess, idx_to_class = get_model()
    try:
        result = predict_one(path, model, preprocess, idx_to_class, topk=topk)  # type: ignore[misc]
    except TypeError:
        # Older Predictor signature without topk
        result = predict_one(path, model, preprocess, idx_to_class)

    # Normalize to a stable shape
    if isinstance(result, tuple) and len(result) == 3:
        name, conf, topk_list = result
    elif isinstance(result, tuple) and len(result) == 2:
        name, conf = result
        topk_list = [(name, conf)]
    else:
        # Unexpected shape; degrade gracefully
        name = str(result)
        conf = 0.0
        topk_list = [(name, conf)]

    # Ensure plain Python types
    name = str(name)
    conf = float(conf)
    topk_list = [(str(s), float(c)) for s, c in list(topk_list)]
    return name, conf, topk_list

# ---- Optional route (only used if you include router in main) ----
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Prediction failed: {e}") from e
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
