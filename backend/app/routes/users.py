import bcrypt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, validator, Field, EmailStr
from backend.firebase import db  # already configured
from typing import List

router = APIRouter()

# Define the user model
class User(BaseModel):
    userId: str
    username: str
    email: EmailStr
    password: str  # Store hashed password
    firstName: str
    lastName: str
    role: str  # "user", "expert", or "admin"
    securityQuestions: List[str] = Field(
        example=[
            "What was the name of your first pet?",
            "What is your favorite city?",
            "What is your favorite frog species?"
        ]
    )
    securityAnswers: List[str] = Field(
        example=[
            "Buddy",
            "Cairo",
            "Bullfrog"
        ]
    )

    @validator("role")
    def validate_role(cls, v):
        allowed = {"volunteer", "expert", "admin"}
        if v not in allowed:
            raise ValueError(f"Role must be one of: {', '.join(allowed)}")
        return v
class ForgotPasswordVerify(BaseModel):
    userId: str
    answers: list[str]
    newPassword: str

class ForgotPasswordRequest(BaseModel):
    username: str
    
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

    # Check each answer with bcrypt
    for input_ans, stored_hash in zip(data.answers, stored_hashed_answers):
        if not bcrypt.checkpw(input_ans.encode(), stored_hash.encode()):
            raise HTTPException(status_code=401, detail="Security answers incorrect")

    # Hash new password and update
    new_hashed_pw = bcrypt.hashpw(data.newPassword.encode(), bcrypt.gensalt()).decode()
    doc_ref.update({ "password": new_hashed_pw })

    return { "message": "Password reset successfully" }
#initate forgot password process
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


# POST: Add new user (Register)
@router.post("/users")
def create_user(user: User):
    doc_ref = db.collection("users").document(user.userId)

    # Check if user already exists
    if doc_ref.get().exists:
        raise HTTPException(status_code=400, detail="User already exists")

    # Hash the password
    hashed_pw = bcrypt.hashpw(user.password.encode(), bcrypt.gensalt()).decode()

    # Hash each security answer
    hashed_answers = [bcrypt.hashpw(ans.encode(), bcrypt.gensalt()).decode() for ans in user.securityAnswers]

    # Prepare user data
    user_data = user.dict()
    user_data["password"] = hashed_pw
    user_data["securityAnswers"] = hashed_answers  # Replace plain answers with hashed ones
    del user_data["securityQuestions"]  # optional: don't store plain text answers

    # Save to Firestore
    doc_ref.set(user_data)

    return {"message": "User created successfully"}


# GET: Retrieve user
@router.get("/users/{user_id}")
def get_user(user_id: str):
    doc = db.collection("users").document(user_id).get()
    if doc.exists:
        user_data = doc.to_dict()
        user_data.pop("password", None)  # Hide password
        return user_data
    raise HTTPException(status_code=404, detail="User not found")

class LoginUser(BaseModel):
    username: str
    password: str

@router.post("/login")
def login_user(login: LoginUser):
    users_ref = db.collection("users")
    query = users_ref.where("username", "==", login.username).limit(1).stream()

    user_doc = next(query, None)
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user_data = user_doc.to_dict()
    stored_hash = user_data.get("password")

    if not stored_hash or not bcrypt.checkpw(login.password.encode(), stored_hash.encode()):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user_data.pop("password", None)  # Don't send password back
    return {"message": "Login successful", "user": user_data}