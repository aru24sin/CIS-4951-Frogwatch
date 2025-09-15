# tests/test_users_and_feedback.py

import uuid
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def get_auth_headers(role: str = "volunteer"):
    test_email = f"pytest_{uuid.uuid4().hex[:6]}@frogwatch.com"
    test_password = "Test1234"

    # Register a fresh user
    r = client.post(
        "/auth/register",
        json={
            "email": test_email,
            "password": test_password,
            "display_name": "Test User",
            "role": role
        }
    )
    assert r.status_code == 200, f"Register failed: {r.text}"

    # Login with that user
    r = client.post("/auth/login", json={"email": test_email, "password": test_password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json()["access_token"]

    return {"Authorization": f"Bearer {token}"}, test_email


def test_user_profile_and_feedback():
    headers, test_email = get_auth_headers()

    profile = {
        "userId": test_email,
        "username": "frog_lover7",
        "email": test_email,
        "firstName": "Test",
        "lastName": "User",
        "role": "volunteer",
        "securityQuestions": ["a", "b", "c"],
        "securityAnswers": ["a1", "b2", "c3"],
        "fcmToken": None
    }

    r = client.post("/users", json=profile, headers=headers)
    assert r.status_code == 200, r.text

    feedback_payload = {
        "feedbackId": str(uuid.uuid4()),
        "userId": test_email,
        "message": "Great app!",
        "rating": 5
    }

    r = client.post("/feedback/", json=feedback_payload, headers=headers)
    assert r.status_code == 200, r.text
