import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

# Generate a unique email each test run
TEST_EMAIL = f"testuser+{uuid.uuid4().hex[:6]}@frogwatch.com"
TEST_PASSWORD = "Test1234!"

client = TestClient(app)

@pytest.mark.asyncio
async def test_backend():
    ac = client

    # Register
    r = ac.post("/auth/register", json={
        "email": TEST_EMAIL, "password": TEST_PASSWORD, "display_name": "Test User", "role": "volunteer"
    })
    assert r.status_code == 200

    # Login
    r = ac.post("/auth/login", json={
        "email": TEST_EMAIL, "password": TEST_PASSWORD
    })
    assert r.status_code == 200
    data = r.json()
    token = data["idToken"]
    headers = {"Authorization": f"Bearer {token}"}

    # /auth/refresh
    refresh = data["refreshToken"]
    r = ac.post("/auth/refresh", json={"refreshToken": refresh})
    assert r.status_code == 200

    # USER SETTINGS
    uid = data["uid"]
    r = ac.post("/users/settings", headers=headers, json={
        "userId": uid,
        "shareGPS": False,
        "notificationsEnabled": True
    })
    assert r.status_code == 200

    r = ac.get(f"/users/settings/{uid}", headers=headers)
    assert r.status_code == 200
    assert r.json()["shareGPS"] is False

    # MODEL
    r = ac.get("/model/latest", headers=headers)
    assert r.status_code == 200
    assert "version" in r.json()

    # ROLE CHANGE (should fail since this test user is not admin)
    r = ac.patch(f"/users/{uid}/role", headers=headers, json={"newRole": "expert"})
    assert r.status_code in (401, 403)

    # CREATE SECURITY QA
    r = ac.post("/users/security-qa", headers=headers, json={
        "userId": uid,
        "securityQuestions": ["A", "B", "C"],
        "securityAnswers": ["1", "2", "3"]
    })
    assert r.status_code == 200

    # FORGOT-PASSWORD
    r = ac.post("/users/forgot-password/initiate", json={"username": TEST_EMAIL})
    assert r.status_code in (200, 404, 403)

    # AUTH/ME
    r = ac.get("/auth/me", headers=headers)
    assert r.status_code == 200

    print("automated endpoint checks passed.")
