import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import DELETE_FIELD

# Load your service account key
cred = credentials.Certificate("backend/serviceAccountKey.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

batch = db.batch()
count = 0
for doc in db.collection("users").stream():
    data = doc.to_dict() or {}
    if "password" in data:
        batch.update(doc.reference, {"password": DELETE_FIELD})
        count += 1
        if count % 400 == 0:
            batch.commit()
            batch = db.batch()
            print(f"Committed {count} updates so far...")
batch.commit()
print(f"Removed password from {count} doc(s).")
