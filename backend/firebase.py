# backend/firebase.py
import os
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

# Load .env early (so GOOGLE_APPLICATION_CREDENTIALS is available)
load_dotenv()

print("🔑 GOOGLE_APPLICATION_CREDENTIALS =", os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))

# Initialize Firebase only once
if not firebase_admin._apps:
    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    else:
        # Falls back to Application Default Credentials
        firebase_admin.initialize_app()

# Export Firestore client
db = firestore.client()
