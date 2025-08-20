# tests/test_users_and_feedback.py

from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_user_profile_and_feedback():
    profile = {
        "userId": "testUser",
        "username": "frog_lover7",
        "email": "frog@demo.com",
        "firstName": "Test",
        "lastName": "User",
        "role": "volunteer",
        "securityQuestions": ["a", "b", "c"],
        "securityAnswers": ["a1", "b2", "c3"],
        "fcmToken": None
    }
    r = client.post("/users", json=profile)
    assert r.status_code == 200

    feedback_payload = {
        "feedbackId": "fid123",
        "message": "Great app!",
        "rating": 5,
        "recordingId": "",
        "userId": "testUser"
    }
    r = client.post("/feedback", json=feedback_payload)
    assert r.status_code == 200
