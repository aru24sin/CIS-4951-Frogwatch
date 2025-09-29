# backend/utils/set_role_claim.py
import firebase_admin
from firebase_admin import auth, credentials

# Load your Firebase service account (ignored by Git)
cred = credentials.Certificate("backend/keys/frogwatch-service.json")
firebase_admin.initialize_app(cred)

def set_custom_user_role(uid: str, role: str):
    """Assign a role (admin/expert/volunteer) as a custom claim in Firebase Auth"""
    auth.set_custom_user_claims(uid, {"role": role})
    print(f"✅ Role '{role}' set for user {uid}")

if __name__ == "__main__":
    # Example: give an admin role to a user
    uid = "HHR5uqZGefYmKOR4aL1uS1OwZPT2"  # replace with real user UID
    set_custom_user_role(uid, "admin")

