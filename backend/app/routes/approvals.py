from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from backend.firebase import db

router = APIRouter()

class Approval(BaseModel):
    approvalId: str
    comments: Optional[str] = ""
    decision: Optional[str] = ""
    expertId: Optional[str] = ""
    recordingId: Optional[str] = ""
    timestamp: Optional[str] = ""

@router.post("/approvals")
def create_approval(approval: Approval):
    db.collection("approvals").document(approval.approvalId).set(approval.dict())
    return {"message": "Approval created successfully"}

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
