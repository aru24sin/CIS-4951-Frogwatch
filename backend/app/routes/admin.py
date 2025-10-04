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

def serialize_firestore(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Firestore types into JSON-safe Python types."""
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

# ------------------ List All Submissions ------------------
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