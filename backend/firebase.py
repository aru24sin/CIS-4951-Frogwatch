# backend/firebase.py
import os
from pathlib import Path
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

# Load .env for local development (harmless in Cloud Run)
load_dotenv()

# If running on Cloud Run, use the secret-mounted path
if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
    cred_path = os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
else:
    # Local development fallback: use your local JSON
    BASE_DIR = Path(__file__).resolve().parent
    cred_path = BASE_DIR / "keys" / "frogwatch-service.json"

# Initialize Firebase only once
if not firebase_admin._apps:
    cred = credentials.Certificate(str(cred_path))
    firebase_admin.initialize_app(cred)

# Firestore client
db = firestore.client()

