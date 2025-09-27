# backend/utils/roles.py
from backend.firebase import db

def get_user_role(uid: str) -> str:
    user_ref = db.collection("users").document(uid).get()
    if not user_ref.exists:
        return "volunteer"  # default role
    return user_ref.to_dict().get("role", "volunteer")
