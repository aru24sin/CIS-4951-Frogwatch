import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("/Users/ashammout7/Downloads/frogwatch-backend-firebase-adminsdk-fbsvc-7935184060.json")
firebase_admin.initialize_app(cred)

db = firestore.client()
