# backend/app/routes/feedback.py
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from firebase_admin import firestore
from backend.utils.roles import get_user_role  # ✅ centralized role checker

from .auth import get_current_user

router = APIRouter(prefix="/feedback", tags=["Feedback"])
db = firestore.client()


# --- Pydantic models ---------------------------------------------------------
class FeedbackCreate(BaseModel):
    message: str = Field(..., example="Great app!")
    rating: Optional[int] = Field(None, ge=1, le=5, example=4)
    recordingId: Optional[str] = Field(None, example="abc123")


class FeedbackResponse(BaseModel):
    response: str = Field(..., example="Thank you for your feedback!")


# --- Routes ------------------------------------------------------------------
@router.post("/", response_model=Dict[str, str])
def create_feedback(payload: FeedbackCreate, user=Depends(get_current_user)):
    """
    Any logged-in user (volunteer, expert, admin) can submit feedback.
    Feedback is tagged with their role so frontend can display it.
    """
    role = get_user_role(user["uid"])

    doc_ref = db.collection("feedback").document()
    data = {
        "id": doc_ref.id,
        "userId": user["uid"],
        "username": user.get("name") or user.get("email"),
        "role": role,
        "message": payload.message,
        "rating": payload.rating,
        "recordingId": payload.recordingId,
        "response": None,
        "timestamp": firestore.SERVER_TIMESTAMP,
    }
    doc_ref.set(data)
    return {"message": "Feedback submitted"}


@router.get("/", response_model=List[Dict[str, str]])
def list_my_feedback(user=Depends(get_current_user)):
    """
    Each user only sees the feedback they personally submitted.
    Includes admin responses if available.
    """
    try:
        q = (
            db.collection("feedback")
            .where("userId", "==", user["uid"])
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
        )
    except Exception:
        q = db.collection("feedback").where("userId", "==", user["uid"])

    results = []
    for d in q.stream():
        doc = d.to_dict()
        if "timestamp" in doc and doc["timestamp"] is not None:
            doc["timestamp"] = doc["timestamp"].isoformat()
        results.append(doc)
    return results


@router.get("/all", response_model=List[Dict[str, str]])
def list_all_feedback(
    role_filter: Optional[str] = Query(None, description="Filter by role: volunteer/expert/admin"),
    recording_id: Optional[str] = Query(None, description="Filter by recordingId"),
    user=Depends(get_current_user)
):
    """
    Admin-only: list all feedback, with optional filters.
    - role_filter: volunteer/expert/admin
    - recording_id: only feedback for a specific recording
    """
    role = get_user_role(user["uid"])
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view all feedback")

    q = db.collection("feedback")

    if role_filter:
        q = q.where("role", "==", role_filter)
    if recording_id:
        q = q.where("recordingId", "==", recording_id)

    try:
        q = q.order_by("timestamp", direction=firestore.Query.DESCENDING)
    except Exception:
        pass

    results = []
    for d in q.stream():
        doc = d.to_dict()
        if "timestamp" in doc and doc["timestamp"] is not None:
            doc["timestamp"] = doc["timestamp"].isoformat()
        results.append(doc)
    return results


@router.delete("/{feedback_id}", response_model=Dict[str, str])
def delete_feedback(feedback_id: str, user=Depends(get_current_user)):
    """
    Volunteers/Experts can delete their own feedback.
    Admins can delete any feedback.
    """
    doc_ref = db.collection("feedback").document(feedback_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Feedback not found")

    data = doc.to_dict()
    role = get_user_role(user["uid"])
    if data["userId"] != user["uid"] and role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to delete this feedback")

    doc_ref.delete()
    return {"message": "Feedback deleted"}


@router.post("/{feedback_id}/respond", response_model=Dict[str, str])
def respond_feedback(feedback_id: str, payload: FeedbackResponse, user=Depends(get_current_user)):
    """
    Admin-only: attach a response to feedback.
    Volunteers will see it in their feedback list.
    """
    role = get_user_role(user["uid"])
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can respond to feedback")

    doc_ref = db.collection("feedback").document(feedback_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Feedback not found")

    doc_ref.update({"response": payload.response})
    return {"message": "Response added"}