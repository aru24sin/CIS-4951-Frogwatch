from __future__ import annotations
import os, sys, time, tempfile
from pathlib import Path
from typing import Optional
import traceback

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

ROOT = Path(__file__).parent
MODEL_DIR = ROOT / "backend" / "model"
sys.path.append(str(MODEL_DIR))  # import Predictor from model dir

from Predictor import from_pretrained, predict_one

MODEL_FILE = os.getenv("FROGNET_WEIGHTS", "frognet_head_maxprob_a3_k3.pth")

app = FastAPI(title="Frogwatch Inference API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    print(">>", request.method, request.url.path)
    t0 = time.perf_counter()
    try:
        resp = await call_next(request)
        return resp
    finally:
        print(f"<< {request.method} {request.url.path} in {(time.perf_counter()-t0)*1000:.1f} ms")

@app.get("/health")
def health():
    return {"status": "ok"}

print(f"[init] loading model from {MODEL_DIR} / {MODEL_FILE}")
_model, _preprocess, _idx_to_class = from_pretrained(str(MODEL_DIR), filename=MODEL_FILE)
print(f"[init] classes: {sorted(_idx_to_class.values())}")

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

@app.post("/predict")
@app.post("/ml/predict")
async def predict(
    file: Optional[UploadFile] = File(None),
    audio_url: Optional[str] = Form(None),
    topk: int = Form(3),
):
    if not file and not audio_url:
        return JSONResponse({"error": "No audio provided"}, status_code=400)

    local_path = None
    try:
        if file:
            local_path = _save_to_tmp(file)
        else:
            return JSONResponse({"error": "audio_url not supported in this build"}, status_code=400)

        name, conf, topk_out, ms = _infer(local_path, topk=topk)
        return {
            "species": name,
            "confidence": round(float(conf), 4),
            "topk": [{"label": lbl, "p": float(p)} for (lbl, p) in topk_out],
            "inference_ms": round(ms, 1),
        }
    except Exception as e:
        # Print full traceback to the server console
        print("\n=== FULL TRACEBACK ===")
        traceback.print_exc()
        print("======================\n")
        # Also return it in JSON so the client can see it too (temporary)
        return JSONResponse(
            {"error": f"{type(e).__name__}: {e}", "traceback": traceback.format_exc()},
            status_code=500
        )
    finally:
        if local_path and os.path.exists(local_path):
            try: os.remove(local_path)
            except Exception: pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api_main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=True
    )
