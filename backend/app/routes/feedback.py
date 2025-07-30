from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.firebase import db

router = APIRouter()

class Feedback(BaseModel):
    feedbackId: str
    message: Optional[str] = ""
    rating: Optional[int] = 0
    recordingId: Optional[str] = ""
    response: Optional[str] = ""
    timestamp: Optional[str] = ""
    userId: Optional[str] = ""

@router.post("/feedback")
def create_feedback(feedback: Feedback):
    db.collection("feedback").document(feedback.feedbackId).set(feedback.dict())
    return {"message": "Feedback created successfully"}

@router.get("/feedback")
def get_feedback():
    docs = db.collection("feedback").stream()
    return [doc.to_dict() for doc in docs]

@router.put("/feedback/{feedback_id}")
def update_feedback(feedback_id: str, feedback: Feedback):
    doc_ref = db.collection("feedback").document(feedback_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Feedback not found")
    doc_ref.update(feedback.dict(exclude_unset=True))
    return {"message": "Feedback updated successfully"}

@router.delete("/feedback/{feedback_id}")
def delete_feedback(feedback_id: str):
    doc_ref = db.collection("feedback").document(feedback_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Feedback not found")
    doc_ref.delete()
    return {"message": "Feedback deleted successfully"}
