import bcrypt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.firebase import db  # already configured

router = APIRouter()

# Define the user model
class User(BaseModel):
    userId: str
    username: str
    password: str  # Store hashed password
    firstName: str
    lastName: str
    role: str  # "user", "expert", or "admin"

# POST: Add new user (Register)
@router.post("/users")
def create_user(user: User):
    doc_ref = db.collection("users").document(user.userId)
    # Check if user already exists
    if doc_ref.get().exists:
        raise HTTPException(status_code=400, detail="User already exists")

    # Hash the password before saving
    hashed_pw = bcrypt.hashpw(user.password.encode(), bcrypt.gensalt()).decode()

    user_data = user.dict()
    user_data["password"] = hashed_pw  # Store the hashed password

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