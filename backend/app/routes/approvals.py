from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.firebase import db
from datetime import datetime
from firebase_admin import firestore

router = APIRouter()

class Approval(BaseModel):
    approvalId: str
    expertId: str
    recordingId: str
    approved: bool
    confidenceScore: float
    trustedLabel: str
    comments: Optional[str] = ""
    timestamp: Optional[str] = None

@router.post("/approvals")
def create_approval(approval: Approval):
    # Prepare data
    approval_data = approval.dict()
    approval_data["timestamp"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    # 1. Save to approvals collection
    db.collection("approvals").document(approval.approvalId).set(approval_data)

    # 2. Update recording status to "approved"
    rec_ref = db.collection("recordings").document(approval.recordingId)
    if rec_ref.get().exists:
        rec_ref.update({"status": "approved"})

    # 3. Update expert profile
    expert_ref = db.collection("users").document(approval.expertId)
    if expert_ref.get().exists:
        expert_ref.update({
            "approvedRecordings": firestore.ArrayUnion([approval.recordingId]),
            f"confidenceScores.{approval.recordingId}": approval.confidenceScore
        })

    return {"message": "Approval created and synced successfully"}

@router.get("/approvals")
def get_approvals():
    docs = db.collection("approvals").stream()
    return [doc.to_dict() for doc in docs]

@router.get("/approvals/{recording_id}")
def get_approval_by_recording(recording_id: str):
    docs = db.collection("approvals").where("recordingId", "==", recording_id).stream()
    return [doc.to_dict() for doc in docs]

@router.put("/approvals/{approval_id}")
def update_approval(approval_id: str, approval: Approval):
    doc_ref = db.collection("approvals").document(approval_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Approval not found")
    doc_ref.update(approval.dict(exclude_unset=True))
    return {"message": "Approval updated successfully"}

@router.delete("/approvals/{approval_id}")
def delete_approval(approval_id: str):
    doc_ref = db.collection("approvals").document(approval_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Approval not found")
    doc_ref.delete()
    return {"message": "Approval deleted successfully"}
