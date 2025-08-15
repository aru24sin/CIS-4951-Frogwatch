# backend/app/routes/auth.py

from fastapi import APIRouter, HTTPException, Depends, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional
import os, requests

import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore


# --- Firebase Admin init (one time) ------------------------------------------
# I prefer reading the service account path from env so nothing secret lives in git.
if not firebase_admin._apps:
    sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if sa_path and os.path.exists(sa_path):
        cred = credentials.Certificate(sa_path)
        firebase_admin.initialize_app(cred)
    else:
        # Falls back to ADC (works on GCP or after `gcloud auth application-default login`).
        firebase_admin.initialize_app()

# Router + Firestore handle
router = APIRouter(prefix="/auth", tags=["auth"])
db = firestore.client()

# --- Auth dependency ---------------------------------------------------------
# Using FastAPI's HTTPBearer so Swagger shows the lock icon and the header.
security = HTTPBearer(auto_error=True)

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    """Verify the Firebase ID token and hand downstream routes a decoded payload."""
    token = creds.credentials
    try:
        return fb_auth.verify_id_token(token)  # contains uid, email, exp, etc.
    except fb_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except fb_auth.RevokedIdTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


# --- Request/Response models (these make /docs crystal clear) ----------------
class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None
    role: Optional[str] = "volunteer"

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
    expiresIn: int  # seconds

class MeResp(BaseModel):
    uid: str
    email: Optional[str] = None


# --- Routes ------------------------------------------------------------------
@router.post("/register", response_model=RegisterResp)
def register(req: RegisterReq):
    """
    Create the auth user in Firebase; I also write a minimal profile to Firestore.
    (Passwords are never stored by me; Firebase handles salted, one-way hashing.)
    """
    user = fb_auth.create_user(
        email=req.email,
        password=req.password,
        display_name=req.display_name
    )
    db.collection("users").document(user.uid).set(
        {
            "uid": user.uid,
            "email": req.email,
            "displayName": req.display_name,
            "role": req.role,
        },
        merge=True,
    )
    return {"uid": user.uid, "message": "User created"}

@router.post("/login", response_model=LoginResp)
def login(req: LoginReq):
    """
    Email/Password login via Firebase Identity Toolkit REST API.
    I return the idToken so the client can call protected endpoints.
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
        # I bubble up Firebase's error message when available (e.g., EMAIL_NOT_FOUND).
        msg = "LOGIN_FAILED"
        try:
            msg = r.json().get("error", {}).get("message", msg)
        except Exception:
            pass
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
    # This shows a nice input box in Swagger, but validation is done by the dependency.
    authorization: str = Header(..., description="Bearer <idToken>"),
    user=Depends(get_current_user),
):
    """
    Simple “who am I” endpoint: verifies the token and echoes back who’s calling.
    Great for clients to confirm they’re logged in and for debugging.
    """
    return {"uid": user["uid"], "email": user.get("email")}
