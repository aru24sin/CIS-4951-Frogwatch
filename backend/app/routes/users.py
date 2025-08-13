import bcrypt
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, validator, Field, EmailStr
from typing import List

from backend.firebase import db  # Firestore client (already configured)
from firebase_admin import auth  # Admin SDK to update password
from backend.app.routes.auth import get_current_user  # token verifier (returns decoded JWT)

router = APIRouter(prefix="/users", tags=["users"])

# --- Models ---
class UserProfile(BaseModel):
    userId: str            # Firebase UID
    username: str
    email: EmailStr
    firstName: str
    lastName: str
    role: str              # volunteer | expert | admin
    securityQuestions: List[str] = Field(
        example=[
            "What was the name of your first pet?",
            "What is your favorite city?",
            "What is your favorite frog species?"
        ]
    )
    securityAnswers: List[str] = Field(
        example=["Buddy", "Cairo", "Bullfrog"]
    )

    @validator("role")
    def validate_role(cls, v):
        allowed = {"volunteer", "expert", "admin"}
        if v not in allowed:
            raise ValueError(f"Role must be one of: {', '.join(allowed)}")
        return v


class ForgotPasswordRequest(BaseModel):
    username: str


class ForgotPasswordVerify(BaseModel):
    userId: str
    answers: List[str]   # exactly 3
    newPassword: str


class UpdateSecurityQA(BaseModel):
    userId: str
    securityQuestions: List[str]   # 3 questions (plain text)
    securityAnswers: List[str]     # 3 new answers (plain text to be hashed)


# --- Routes ---

# Create/Update user profile (NO password stored in Firestore)
@router.post("")
def create_or_update_user(profile: UserProfile, user=Depends(get_current_user)):
    # Only allow the authenticated user to modify their own profile
    if user["uid"] != profile.userId:
        raise HTTPException(status_code=403, detail="Not your profile")

    if len(profile.securityQuestions) != 3 or len(profile.securityAnswers) != 3:
        raise HTTPException(status_code=400, detail="Exactly 3 security questions and 3 answers are required")

    doc_ref = db.collection("users").document(profile.userId)

    # Hash each security answer before storing
    hashed_answers = [
        bcrypt.hashpw(ans.encode(), bcrypt.gensalt()).decode()
        for ans in profile.securityAnswers
    ]

    user_data = profile.dict()
    user_data["securityAnswers"] = hashed_answers
    user_data.pop("password", None)  # ensure no password field ever sneaks in

    # Keep securityQuestions so you can display them during reset
    doc_ref.set(user_data, merge=True)
    return {"message": "User profile saved"}


# Get user profile (never return password—even if it somehow exists)
@router.get("/{user_id}")
def get_user(user_id: str, user=Depends(get_current_user)):
    # Allow owner to read; adjust if admins should read others
    if user["uid"] != user_id:
        raise HTTPException(status_code=403, detail="Not your profile")

    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
    user_data = doc.to_dict()
    user_data.pop("password", None)
    return user_data


# Step 1 of forgot password: get the questions by username (public)
@router.post("/forgot-password/initiate")
def forgot_password_initiate(request: ForgotPasswordRequest):
    users_ref = db.collection("users")
    query = users_ref.where("username", "==", request.username).limit(1).stream()
    user_doc = next(query, None)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    user_data = user_doc.to_dict()
    return {
        "userId": user_doc.id,
        "securityQuestions": user_data.get("securityQuestions", [])
    }


# Step 2: verify answers, then update password in Firebase Auth (public)
@router.post("/forgot-password/verify")
def forgot_password_verify(data: ForgotPasswordVerify):
    doc_ref = db.collection("users").document(data.userId)
    user_doc = doc_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")

    user_data = user_doc.to_dict()
    stored_hashed_answers = user_data.get("securityAnswers", [])

    if len(stored_hashed_answers) != 3 or len(data.answers) != 3:
        raise HTTPException(status_code=400, detail="Invalid answer format")

    for input_ans, stored_hash in zip(data.answers, stored_hashed_answers):
        if not bcrypt.checkpw(input_ans.encode(), stored_hash.encode()):
            raise HTTPException(status_code=401, detail="Security answers incorrect")

    # Update the password in Firebase Auth (Firebase salts+hashes internally)
    try:
        auth.update_user(data.userId, password=data.newPassword)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update password: {e}")

    return {"message": "Password reset successfully"}


# Update security questions/answers (owner-only)
@router.post("/security-qa")
def update_security_qa(payload: UpdateSecurityQA, user=Depends(get_current_user)):
    if user["uid"] != payload.userId:
        raise HTTPException(status_code=403, detail="Not your profile")

    if len(payload.securityQuestions) != 3 or len(payload.securityAnswers) != 3:
        raise HTTPException(status_code=400, detail="Exactly 3 questions and 3 answers are required")

    ref = db.collection("users").document(payload.userId)
    if not ref.get().exists:
        raise HTTPException(status_code=404, detail="User not found")

    hashed_answers = [
        bcrypt.hashpw(ans.encode(), bcrypt.gensalt()).decode()
        for ans in payload.securityAnswers
    ]

    ref.set({
        "securityQuestions": payload.securityQuestions,  # keep questions
        "securityAnswers": hashed_answers                # store hashed answers
    }, merge=True)

    return {"message": "Security questions and answers updated"}
