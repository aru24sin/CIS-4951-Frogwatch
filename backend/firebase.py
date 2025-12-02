# backend/firebase.py
import os
import json
from pathlib import Path
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

# Load .env for local dev
load_dotenv()

def _build_cred():
    # 1) Cloud Run / Secret Manager: env var set
    env_val = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if env_val:
        # If the value looks like JSON, parse it as JSON
        if env_val.strip().startswith("{"):
            info = json.loads(env_val)
            return credentials.Certificate(info)
        # Otherwise, treat it as a file path
        return credentials.Certificate(env_val)

    # 2) Local fallback: use keys file in the repo
    base_dir = Path(__file__).resolve().parent
    local_path = base_dir / "keys" / "frogwatch-service.json"
    return credentials.Certificate(str(local_path))

# Initialize Firebase only once
if not firebase_admin._apps:
    cred = _build_cred()
    firebase_admin.initialize_app(cred)

# Firestore client
db = firestore.client()
