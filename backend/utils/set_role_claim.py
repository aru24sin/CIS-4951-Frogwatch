# backend/utils/set_role_claim.py
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("backend/keys/frogwatch-service.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

def set_user_role(uid: str, role: str):
    """Assign a role (admin/expert/volunteer) in Firestore"""
    user_ref = db.collection("users").document(uid)
    user_ref.update({"role": role})
    print(f"✅ Role '{role}' set for user {uid} in Firestore")

if __name__ == "__main__":
    uid = "PUT-REAL-UID-HERE"
    set_user_role(uid, "expert")
