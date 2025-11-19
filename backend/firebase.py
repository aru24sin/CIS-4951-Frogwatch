# backend/firebase.py
import os
from pathlib import Path
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

# Load .env (still fine for other vars)
load_dotenv()

# Directory of this file: /app/backend inside the container
BASE_DIR = Path(__file__).resolve().parent

# Service account JSON is stored in backend/
SERVICE_ACCOUNT_FILE = BASE_DIR / "frogwatch-backend-firebase-adminsdk-fbsvc-38e9d9024d.json"

# Always use the JSON file in the repo (works locally + in Docker)
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_FILE)

print("🔑 GOOGLE_APPLICATION_CREDENTIALS =", os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))

# Initialize Firebase only once
if not firebase_admin._apps:
    cred = credentials.Certificate(str(SERVICE_ACCOUNT_FILE))
    firebase_admin.initialize_app(cred)

# Export Firestore client
db = firestore.client()
