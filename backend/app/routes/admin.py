# backend/app/routes/admin.py

from fastapi import APIRouter, HTTPException, Depends, status, Query
from typing import List, Dict, Any, Optional
from datetime import datetime

from google.cloud.firestore_v1._helpers import GeoPoint
from google.cloud import firestore  

from backend.utils.roles import get_user_role
from backend import firebase
from .auth import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])
CurrentUser = Dict[str, Any]


# ---------- Helpers ----------

def serialize_firestore(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Firestore data types into JSON-safe Python types."""
    out: Dict[str, Any] = {}
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


def ensure_admin(user: CurrentUser) -> None:
    """Raise 403 if the current user is not an admin."""
    role = get_user_role(user["uid"])
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins only",
        )


def get_recording_or_404(recording_id: str) -> Any:
    """Fetch a recording document or raise 404."""
    doc_ref = firebase.db.collection("recordings").document(recording_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Recording not found")
    return doc_ref, doc


def append_history_entry(doc_data: Dict[str, Any], entry: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Append a history entry to the recording's history array."""
    history = doc_data.get("history", [])
    if not isinstance(history, list):
        history = []
    history.append(entry)
    return history


# ---------- EXISTING ROUTES (kept for compatibility) ----------

@router.get("/submissions", response_model=List[Dict[str, Any]])
def list_submissions(
    status_filter: Optional[str] = Query(
        None, description="Filter by status: pending/approved/rejected"
    ),
    user: CurrentUser = Depends(get_current_user),
):
    """Original admin endpoint to list submissions."""
    ensure_admin(user)

    q = firebase.db.collection("recordings")
    if status_filter:
        q = q.where("status", "==", status_filter)

    results = []
    for d in q.stream():
        doc = d.to_dict()
        doc["id"] = d.id
        results.append(serialize_firestore(doc))

    return results


@router.patch("/submissions/{recording_id}")
def update_submission_status(
    recording_id: str,
    new_status: str = Query(..., description="New status: approved/rejected"),
    user: CurrentUser = Depends(get_current_user),
):
    """Original admin endpoint to update status."""
    ensure_admin(user)

    if new_status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status value")

    doc_ref, doc = get_recording_or_404(recording_id)
    old_data = doc.to_dict()
    old_status = old_data.get("status")

    history_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "action": "status_update",
        "actorId": user["uid"],
        "actorRole": "admin",
        "old_status": old_status,
        "new_status": new_status,
    }

    history = append_history_entry(old_data, history_entry)

    doc_ref.update(
        {
            "status": new_status,
            "expertId": user["uid"],  # who approved/rejected
            "reviewed_at": datetime.utcnow(),
            "history": history,
        }
    )

    return {"message": f"Recording {recording_id} marked as {new_status}"}


@router.get("/users", response_model=List[Dict[str, Any]])
def list_users(user: CurrentUser = Depends(get_current_user)):
    """List all users (admin only)."""
    ensure_admin(user)

    users = []
    for doc in firebase.db.collection("users").stream():
        data = doc.to_dict()
        data["id"] = doc.id
        users.append(data)
    return users


# ---------- NEW ROUTES (matching meeting expectations) ----------

@router.get("/getAllRecordings", response_model=List[Dict[str, Any]])
def get_all_recordings(
    status_filter: Optional[str] = Query(
        None, description="Filter by status: pending/approved/rejected"
    ),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Alias for list_submissions, but with the name the frontend expects:
    /admin/getAllRecordings
    """
    ensure_admin(user)

    q = firebase.db.collection("recordings")
    if status_filter:
        q = q.where("status", "==", status_filter)

    results = []
    for d in q.stream():
        doc = d.to_dict()
        doc["id"] = d.id
        results.append(serialize_firestore(doc))

    return results


@router.get("/viewRecordingDetails/{recording_id}", response_model=Dict[str, Any])
def view_recording_details(
    recording_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """
    View a single recording's full details, including history.
    """
    ensure_admin(user)

    doc_ref = firebase.db.collection("recordings").document(recording_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Recording not found")

    data = doc.to_dict()
    data["id"] = doc.id
    return serialize_firestore(data)


@router.patch("/updateStatus/{recording_id}")
def update_status(
    recording_id: str,
    new_status: str = Query(..., description="New status: approved/rejected"),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Update only the status of a recording.
    Also records expertId and appends to history[].
    """
    ensure_admin(user)

    if new_status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status value")

    doc_ref, doc = get_recording_or_404(recording_id)
    old_data = doc.to_dict()
    old_status = old_data.get("status")

    history_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "action": "status_update",
        "actorId": user["uid"],
        "actorRole": "admin",
        "old_status": old_status,
        "new_status": new_status,
    }

    history = append_history_entry(old_data, history_entry)

    doc_ref.update(
        {
            "status": new_status,
            "expertId": user["uid"],
            "reviewed_at": datetime.utcnow(),
            "history": history,
        }
    )

    return {"message": f"Status for {recording_id} updated to {new_status}"}


@router.patch("/updateConfidence/{recording_id}")
def update_confidence(
    recording_id: str,
    confidence_score: float = Query(..., ge=0.0, le=1.0, description="New confidence score (0.0–1.0)"),
    user: CurrentUser = Depends(get_current_user),
):
    """
    Update the confidence score of a recording.
    Also appends an entry to history[].
    """
    ensure_admin(user)

    doc_ref, doc = get_recording_or_404(recording_id)
    old_data = doc.to_dict()
    old_conf = old_data.get("confidenceScore", old_data.get("confidence"))

    history_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "action": "confidence_update",
        "actorId": user["uid"],
        "actorRole": "admin",
        "old_confidence": old_conf,
        "new_confidence": confidence_score,
    }

    history = append_history_entry(old_data, history_entry)

    doc_ref.update(
        {
            "confidenceScore": confidence_score,
            "history": history,
        }
    )

    return {"message": f"Confidence for {recording_id} updated", "confidenceScore": confidence_score}
