# backend/app/main.py
from fastapi import FastAPI, Depends, File, UploadFile
from fastapi.security import HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from backend.app.routes import audio, users, recordings, approvals, feedback, auth, admin, settings

# Load env first
load_dotenv()

# initializes firebase_admin
import backend.firebase  # DO NOT remove; sets up credentials/app

# Routers
from backend.app.routes import audio, users, recordings, approvals, feedback, auth
from backend.app.routes import ml_runtime            # -> /ml/predict
from backend.app.routes import ml as ml_plain        # -> /predict

# Makes Swagger show lock icon + handle Authorization header automatically
security = HTTPBearer()

app = FastAPI(title="FrogWatch Backend")

# CORS (allow your mobile app / emulator to call the API)
# For production, replace ["*"] with your allowed origins list.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------- Public/unprotected routes --------
app.include_router(auth.router)
app.include_router(ml_runtime.router)   # /ml/predict
app.include_router(ml_plain.router)     # /predict
app.include_router(admin.router)
app.include_router(settings.router)



# -------- Protected routes (Bearer token required) --------
app.include_router(audio.router, dependencies=[Depends(security)])
app.include_router(users.router, dependencies=[Depends(security)])
app.include_router(recordings.router, dependencies=[Depends(security)])
app.include_router(approvals.router, dependencies=[Depends(security)])
app.include_router(feedback.router, dependencies=[Depends(security)])
# from backend.app.routes import email
# app.include_router(email.router, dependencies=[Depends(security)])  # re-enable after SMTP config

@app.on_event("startup")
def warm_model() -> None:
    """Load the ML model once on startup to avoid first-request latency."""
    try:
        from backend.app.routes.ml_runtime import get_model
        get_model()
        print("✅ ML model preloaded")
    except Exception as e:
        print(f"⚠️ ML warmup failed: {e}")

@app.get("/")
def read_root():
    return {"message": "FrogWatch Backend is running!"}

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.post("/_debug_upload")
async def _debug_upload(file: UploadFile = File(...)):
    data = await file.read()
    return {"filename": file.filename, "bytes": len(data)}

