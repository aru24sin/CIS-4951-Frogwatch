# backend/app/routes/admin.py

from fastapi import APIRouter, HTTPException, Depends, status, Query
from typing import List, Dict, Any, Optional
from datetime import datetime
from google.cloud.firestore_v1._helpers import GeoPoint

from backend.utils.roles import get_user_role
from backend import firebase
from .auth import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])
CurrentUser = Dict[str, Any]


# ---------- Helper: Serialize Firestore Documents ----------
def serialize_firestore(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Firestore data types into JSON-safe Python types."""
    out = {}
    for k, v in doc.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, GeoPoint):
            out[k] = {"latitude": v.latitude, "longitude": v.longitude}
        elif isinstance(v, dict):
            out[k] = serialize_firestore(v)  # recursive
        elif isinstance(v, list):
            out[k] = [serialize_firestore(i) if isinstance(i, dict) else i for i in v]
        else:
            out[k] = v
    return out


# ---------- GET /admin/submissions ----------
@router.get("/submissions", response_model=List[Dict[str, Any]])
def list_submissions(
    status_filter: Optional[str] = Query(None, description="Filter by status: pending/approved/rejected"),
    user: CurrentUser = Depends(get_current_user)
):
    role = get_user_role(user["uid"])
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")

    q = firebase.db.collection("recordings")
    if status_filter:
        q = q.where("status", "==", status_filter)

    results = []
    for d in q.stream():
        doc = d.to_dict()
        results.append(serialize_firestore(doc))

    return results


# ---------- PATCH /admin/submissions/{recording_id} ----------
@router.patch("/submissions/{recording_id}")
def update_submission_status(
    recording_id: str,
    new_status: str = Query(..., description="New status: approved/rejected"),
    user: CurrentUser = Depends(get_current_user)
):
    role = get_user_role(user["uid"])
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")

    if new_status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status value")

    doc_ref = firebase.db.collection("recordings").document(recording_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Recording not found")

    doc_ref.update({
        "status": new_status,
        "reviewed_at": datetime.utcnow()
    })

    return {"message": f"Recording {recording_id} marked as {new_status}"}


# ---------- GET /admin/users ----------
@router.get("/users", response_model=List[Dict[str, Any]])
def list_users(user: CurrentUser = Depends(get_current_user)):
    role = get_user_role(user["uid"])
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")

    users = []
    for doc in firebase.db.collection("users").stream():
        data = doc.to_dict()
        data["id"] = doc.id
        users.append(data)
    return users
