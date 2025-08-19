# backend/firebase.py
import os
import firebase_admin
from firebase_admin import credentials, firestore

# Use a single global app
if not firebase_admin._apps:
    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")  # set in .env
    if cred_path and os.path.exists(cred_path):
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    else:
        # Falls back to Application Default Credentials (works on GCP/Firebase hosting)
        firebase_admin.initialize_app()

db = firestore.client()
