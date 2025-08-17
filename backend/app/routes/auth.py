from fastapi import APIRouter, HTTPException, Depends, status, Header, Request, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from enum import Enum
from typing import Optional
import os, requests

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore

# --- Firebase Admin init -----------------------------------------------------
if not firebase_admin._apps:
    sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if sa_path and os.path.exists(sa_path):
        cred = credentials.Certificate(sa_path)
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()

router = APIRouter(prefix="/auth", tags=["auth"])
db = firestore.client()

# --- Auth dependency ---------------------------------------------------------
security = HTTPBearer(auto_error=True)

def get_current_user(req: Request, creds: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify the Firebase ID token and echo back the decoded JWT.
    """
    token = creds.credentials
    try:
        return fb_auth.verify_id_token(token)
    except fb_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except fb_auth.RevokedIdTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


# --- Request/Response models -------------------------------------------------
class RoleEnum(str, Enum):
    volunteer = "volunteer"
    expert = "expert"
    admin = "admin"

class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None
    role: RoleEnum  # >>> dropdown of only 3 allowed roles

class RegisterResp(BaseModel):
    uid: str
    message: str

class LoginReq(BaseModel):
    email: EmailStr
    password: str

class LoginResp(BaseModel):
    uid: str
    idToken: str
    refreshToken: str
    expiresIn: int

class MeResp(BaseModel):
    uid: str
    email: Optional[str] = None


# --- Routes ------------------------------------------------------------------
@router.post("/register", response_model=RegisterResp)
def register(req: RegisterReq):
    """
    Register a user with Firebase Authentication
    """
    user = fb_auth.create_user(
        email=req.email,
        password=req.password,
        display_name=req.display_name
    )
    # Store signup metadata in Firestore
    db.collection("users").document(user.uid).set(
        {
            "uid": user.uid,
            "email": req.email,
            "displayName": req.display_name,
            "role": req.role.value,
        },
        merge=True,
    )
    return {"uid": user.uid, "message": "User created"}


@router.post("/login", response_model=LoginResp)
def login(req: LoginReq):
    """
    Login via Firebase Identity Toolkit REST API
    """
    api_key = os.getenv("FIREBASE_WEB_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing FIREBASE_WEB_API_KEY")

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
    payload = {"email": req.email, "password": req.password, "returnSecureToken": True}

    try:
        r = requests.post(url, json=payload, timeout=10)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Auth service unreachable")

    if r.status_code != 200:
        msg = r.json().get("error", {}).get("message", "LOGIN_FAILED")
        raise HTTPException(status_code=401, detail=msg)

    data = r.json()
    return {
        "uid": data["localId"],
        "idToken": data["idToken"],
        "refreshToken": data["refreshToken"],
        "expiresIn": int(data["expiresIn"]),
    }


@router.get("/me", response_model=MeResp)
def me(
    authorization: str = Header(..., description="Bearer <idToken>"),
    user=Depends(get_current_user),
):
    return {"uid": user["uid"], "email": user.get("email")}


@router.post("/refresh", response_model=LoginResp)
def refresh(refreshToken: str = Body(..., embed=True)):
    """
    Exchange a Firebase refreshToken for a new idToken.
    """
    api_key = os.getenv("FIREBASE_WEB_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing FIREBASE_WEB_API_KEY")

    url = f"https://securetoken.googleapis.com/v1/token?key={api_key}"
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refreshToken
    }

    try:
        r = requests.post(url, json=payload, timeout=10)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Auth service unreachable")

    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Could not refresh token")

    data = r.json()
    return {
        "uid": data.get("user_id"),
        "idToken": data["id_token"],
        "refreshToken": data["refresh_token"],
        "expiresIn": int(data["expires_in"]),
    }


@router.post("/forgot-password")
def forgot_password(email: EmailStr):
    """
    Send Firebase password reset link to email.
    """
    api_key = os.getenv("FIREBASE_WEB_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing FIREBASE_WEB_API_KEY")
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key={api_key}"
    payload = {
        "requestType": "PASSWORD_RESET",
        "email": email
    }
    resp = requests.post(url, json=payload, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to send reset email")
    return {"message": "Reset email sent"}
