# backend/utils/roles.py

def get_user_role(uid: str) -> str:
    """
    Look up a user's role in Firestore.
    """
    from backend.firebase import db  # <-- move import inside the function to avoid circular import

    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        return "volunteer"
    return doc.to_dict().get("role", "volunteer")
