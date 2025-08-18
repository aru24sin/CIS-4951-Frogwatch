from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from backend.firebase import db
from firebase_admin import firestore
from backend.app.routes.auth import get_current_user

router = APIRouter(prefix="/model", tags=["model"])

DEFAULT_VERSION = "0.0.1"


@router.get("/latest")
def get_latest_model():
    """
    Return the most recent model version deployed.
    Firestore: collection 'models', document 'latest'.
    Example:
       { "version": "1.4.2", "createdAt": ... }
    """
    try:
        doc = db.collection("models").document("latest").get()
        if doc.exists:
            data = doc.to_dict()
            return data
        else:
            # fallback if not yet created
            return {"version": DEFAULT_VERSION}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching model version: {e}")


class VersionUpdate(BaseModel):
    version: str


@router.post("/latest")
def set_latest_model(payload: VersionUpdate, admin=Depends(get_current_user)):
    """
    Admin-only: set the latest model version in Firestore.
    Auto-creates models/latest document if missing.
    """
    if admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    try:
        db.collection("models").document("latest").set({
            "version": payload.version,
            "createdAt": firestore.SERVER_TIMESTAMP
        })
        return {"message": f"Model version updated to {payload.version}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating model: {e}")

# Optional one-time seeding endpoint (admin only)
@router.post("/seed")
def seed_model_version(admin=Depends(get_current_user)):
    """
    Admin-only: seed Firestore with a default latest model version.
    Use this ONCE at setup time.
    """
    if admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    try:
        db.collection("models").document("latest").set({
            "version": DEFAULT_VERSION,
            "createdAt": firestore.SERVER_TIMESTAMP
        })
        return {"message": f"Seeded latest model version to {DEFAULT_VERSION}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error seeding model: {e}")
