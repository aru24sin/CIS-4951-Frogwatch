# backend/app/routes/feedback.py

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from firebase_admin import firestore

from .auth import get_current_user

router = APIRouter(prefix="/feedback", tags=["Feedback"])
db = firestore.client()


# --- Admin-only helper -------------------------------------------------------
def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    return user


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
    Logged-in users can create feedback. Links to a recordingId (optional).
    """
    doc_ref = db.collection("feedback").document()
    data = {
        "id": doc_ref.id,
        "userId": user["uid"],
        "username": user.get("name") or user.get("email"),
        "role": user.get("role") or "volunteer",
        "message": payload.message,
        "rating": payload.rating,
        "recordingId": payload.recordingId,
        "timestamp": firestore.SERVER_TIMESTAMP,
    }
    doc_ref.set(data)
    return {"message": "Feedback submitted"}


@router.get("/", response_model=List[Dict[str, str]])
def list_my_feedback(user=Depends(get_current_user)):
    """
    Each user only sees the feedback they personally submitted.
    """
    q = (
        db.collection("feedback")
        .where("userId", "==", user["uid"])
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
    )
    return [d.to_dict() for d in q.stream()]


@router.delete("/{feedback_id}", response_model=Dict[str, str])
def delete_feedback(feedback_id: str, user=Depends(get_current_user)):
    """
    Only delete your own feedback.
    """
    doc_ref = db.collection("feedback").document(feedback_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Feedback not found")
    data = doc.to_dict()
    if data["userId"] != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your feedback")
    doc_ref.delete()
    return {"message": "Feedback deleted"}


@router.post("/{feedback_id}/respond", response_model=Dict[str, str])
def respond_feedback(feedback_id: str, payload: FeedbackResponse, admin=Depends(require_admin)):
    """
    Admin-only: attach an internal response message to any feedback entry.
    """
    doc_ref = db.collection("feedback").document(feedback_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Feedback not found")
    doc_ref.update({"response": payload.response})
    return {"message": "Response added"}
