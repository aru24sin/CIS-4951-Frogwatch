from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel, EmailStr
import os, requests
import firebase_admin
from firebase_admin import credentials, auth, firestore

# ---- Firebase Admin init (once) ----
if not firebase_admin._apps:
    cred = credentials.Certificate("backend/serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

# ---- Router & DB ----
router = APIRouter(prefix="/auth", tags=["auth"])
db = firestore.client()

# ---- Helpers ----
def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.split()[1]
    try:
        return auth.verify_id_token(token)  # { uid, email, ... }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# ---- Models ----
class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = None
    role: str | None = "volunteer"

class LoginReq(BaseModel):
    email: EmailStr
    password: str

# ---- Routes ----
@router.post("/register")
def register(req: RegisterReq):
    # Firebase does salted, one-way hashing (no password in Firestore)
    user = auth.create_user(email=req.email, password=req.password, display_name=req.display_name)
    db.collection("users").document(user.uid).set({
        "uid": user.uid,
        "email": req.email,
        "displayName": req.display_name,
        "role": req.role
    }, merge=True)
    return {"uid": user.uid, "message": "User created"}

@router.post("/login")
def login(req: LoginReq):
    """Login via Firebase Authentication."""
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

@router.get("/me")
def me(user = Depends(get_current_user)):
    return {"uid": user["uid"], "email": user.get("email")}
