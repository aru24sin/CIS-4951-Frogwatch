import bcrypt
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel, validator, Field, EmailStr
from typing import List

from backend.firebase import db
from firebase_admin import auth
from backend.app.routes.auth import get_current_user
from backend.utils.push import send_push  # need push.py helper

router = APIRouter(prefix="/users", tags=["users"])

# --- Models ---
class UserProfile(BaseModel):
    userId: str
    username: str
    email: EmailStr
    firstName: str
    lastName: str
    role: str                          # volunteer | expert | admin
    securityQuestions: List[str] = Field(example=[
        "What was the name of your first pet?",
        "What is your favorite city?",
        "What is your favorite frog species?"
    ])
    securityAnswers: List[str] = Field(example=["Buddy", "Cairo", "Bullfrog"])
    fcmToken: str | None = None        # <---- allows phone push

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
    answers: List[str]
    newPassword: str


class UpdateSecurityQA(BaseModel):
    userId: str
    securityQuestions: List[str]
    securityAnswers: List[str]


class UserSettings(BaseModel):
    userId: str
    shareGPS: bool = True
    notificationsEnabled: bool = True

class PushTest(BaseModel):
    fcmToken: str
    title: str = "Frogwatch"
    body: str = "Test push!"


# --- Routes ---

@router.post("")
def create_or_update_user(profile: UserProfile, user=Depends(get_current_user)):
    if user["uid"] != profile.userId:
        raise HTTPException(status_code=403, detail="Not your profile")

    if len(profile.securityQuestions) != 3 or len(profile.securityAnswers) != 3:
        raise HTTPException(status_code=400, detail="Exactly 3 questions and 3 answers are required")

    hashed_answers = [
        bcrypt.hashpw(ans.encode(), bcrypt.gensalt()).decode()
        for ans in profile.securityAnswers
    ]

    data = profile.dict()
    data["securityAnswers"] = hashed_answers
    data.pop("password", None)

    db.collection("users").document(profile.userId).set(data, merge=True)
    return {"message": "User profile saved"}


@router.get("/{user_id}")
def get_user(user_id: str, user=Depends(get_current_user)):
    if user["uid"] != user_id:
        raise HTTPException(status_code=403, detail="Not your profile")

    snap = db.collection("users").document(user_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="User not found")
    data = snap.to_dict()
    data.pop("password", None)
    return data


@router.post("/forgot-password/initiate")
def forgot_password_initiate(request: ForgotPasswordRequest):
    q = db.collection("users").where("username", "==", request.username).limit(1).stream()
    user_doc = next(q, None)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    d = user_doc.to_dict()
    return {"userId": user_doc.id, "securityQuestions": d.get("securityQuestions", [])}


@router.post("/forgot-password/verify")
def forgot_password_verify(data: ForgotPasswordVerify):
    ref = db.collection("users").document(data.userId)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="User not found")

    d = snap.to_dict()
    stored = d.get("securityAnswers", [])

    if len(stored) != 3 or len(data.answers) != 3:
        raise HTTPException(status_code=400, detail="Invalid format")

    for ans, hashed in zip(data.answers, stored):
        if not bcrypt.checkpw(ans.encode(), hashed.encode()):
            raise HTTPException(status_code=401, detail="Security answers incorrect")

    auth.update_user(data.userId, password=data.newPassword)
    return {"message": "Password reset successfully"}


@router.post("/security-qa")
def update_security_qa(payload: UpdateSecurityQA, user=Depends(get_current_user)):
    if user["uid"] != payload.userId:
        raise HTTPException(status_code=403, detail="Not your profile")
    if len(payload.securityQuestions) != 3 or len(payload.securityAnswers) != 3:
        raise HTTPException(status_code=400, detail="Exactly 3 questions and 3 answers are required")

    hashed_answers = [
        bcrypt.hashpw(ans.encode(), bcrypt.gensalt()).decode()
        for ans in payload.securityAnswers
    ]
    db.collection("users").document(payload.userId).set({
        "securityQuestions": payload.securityQuestions,
        "securityAnswers": hashed_answers
    }, merge=True)
    return {"message": "Security questions and answers updated"}


# Admin-only: list
@router.get("")
def list_users(admin=Depends(get_current_user)):
    if admin.get("email") not in {"ahmed+test1@gmail.com"}:
        raise HTTPException(status_code=403, detail="Admins only")
    return [d.to_dict() for d in db.collection("users").stream()]


# Admin-only: promote/demote
@router.patch("/{user_id}/role")
def update_user_role(user_id: str, newRole: str = Body(..., embed=True), admin=Depends(get_current_user)):
    if admin.get("email") not in {"ahmed+test1@gmail.com"}:
        raise HTTPException(status_code=403, detail="Admins only")

    allowed = {"volunteer", "expert", "admin"}
    if newRole not in allowed:
        raise HTTPException(status_code=400, detail=f"newRole must be one of: {', '.join(allowed)}")

    ref = db.collection("users").document(user_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="User not found")

    ref.update({"role": newRole})

    d = snap.to_dict()
    fcm = d.get("fcmToken")
    if fcm:
        if newRole == "expert":
            send_push(fcm, "Frogwatch", "You have received expert access!")
        elif newRole == "admin":
            send_push(fcm, "Frogwatch", "You are now an admin!")
    return {"message": f"Role updated to {newRole}"}


# --- NEW 11.3 Settings/Toggles -------------
@router.post("/settings")
def update_settings(settings: UserSettings, user=Depends(get_current_user)):
    if settings.userId != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your profile")

    db.collection("users").document(settings.userId).set({
        "settings": {
            "shareGPS": settings.shareGPS,
            "notificationsEnabled": settings.notificationsEnabled
        }
    }, merge=True)
    return {"message": "Settings saved successfully"}


@router.get("/settings/{user_id}")
def get_settings(user_id: str, user=Depends(get_current_user)):
    if user_id != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your profile")

    snap = db.collection("users").document(user_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="User not found")

    d = snap.to_dict()
    return d.get("settings", {
        "shareGPS": True,
        "notificationsEnabled": True
    })

@router.post("/test-push")
def test_push(payload: PushTest, admin=Depends(get_current_user)):
    """Manually send a push notification to a specific device.
       (must be logged in as admin)."""
    # Optional: restrict to admins only
    if admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    send_push(payload.fcmToken, payload.title, payload.body)
    return {"message": "Push sent"}