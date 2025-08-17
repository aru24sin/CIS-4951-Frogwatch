# backend/app/routes/approvals.py

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Dict, List
from datetime import datetime
from firebase_admin import firestore

from .auth import get_current_user

router = APIRouter(prefix="/approvals", tags=["Approvals"])
db = firestore.client()


# --- Admin-only helper -------------------------------------------------------
def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    return user


# --- Pydantic model ----------------------------------------------------------
class Approval(BaseModel):
    approvalId: str
    expertId: str
    recordingId: str
    approved: bool
    confidenceScore: float
    trustedLabel: str
    comments: Optional[str] = ""
    timestamp: Optional[str] = None


# --- Routes ------------------------------------------------------------------
@router.post("/", response_model=Dict[str, str])
def create_approval(approval: Approval, admin=Depends(require_admin)):
    approval_data = approval.dict()
    approval_data["timestamp"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    # 1) insert approval record
    db.collection("approvals").document(approval.approvalId).set(approval_data)

    # 2) mark associated recording as approved
    rec_ref = db.collection("recordings").document(approval.recordingId)
    if rec_ref.get().exists:
        rec_ref.update({"status": "approved"})

    # 3) update the expert profile
    expert_ref = db.collection("users").document(approval.expertId)
    if expert_ref.get().exists:
        expert_ref.update({
            "approvedRecordings": firestore.ArrayUnion([approval.recordingId]),
            f"confidenceScores.{approval.recordingId}": approval.confidenceScore
        })

    return {"message": "Approval created and synced successfully"}


@router.get("/", response_model=List[Dict[str, str]])
def get_approvals(admin=Depends(require_admin)):
    docs = db.collection("approvals").stream()
    return [doc.to_dict() for doc in docs]


@router.get("/{recording_id}", response_model=List[Dict[str, str]])
def get_approval_by_recording(recording_id: str, admin=Depends(require_admin)):
    docs = db.collection("approvals").where("recordingId", "==", recording_id).stream()
    return [doc.to_dict() for doc in docs]


@router.put("/{approval_id}", response_model=Dict[str, str])
def update_approval(approval_id: str, approval: Approval, admin=Depends(require_admin)):
    doc_ref = db.collection("approvals").document(approval_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Approval not found")
    doc_ref.update(approval.dict(exclude_unset=True))
    return {"message": "Approval updated successfully"}


@router.delete("/{approval_id}", response_model=Dict[str, str])
def delete_approval(approval_id: str, admin=Depends(require_admin)):
    doc_ref = db.collection("approvals").document(approval_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Approval not found")
    doc_ref.delete()
    return {"message": "Approval deleted successfully"}
