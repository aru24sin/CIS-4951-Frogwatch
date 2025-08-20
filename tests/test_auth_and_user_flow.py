import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

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

    # MODEL (404 on empty DB is OK too)
    r = ac.get("/model/latest", headers=headers)
    assert r.status_code in (200, 404)

    # ROLE CHANGE should be forbidden
    r = ac.patch(f"/users/{uid}/role", headers=headers, json={"newRole": "expert"})
    assert r.status_code in (401, 403)

    # CREATE SECURITY QA
    r = ac.post("/users/security-qa", headers=headers, json={
        "userId": uid,
        "securityQuestions": ["A", "B", "C"],
        "securityAnswers": ["1", "2", "3"]
    })
    assert r.status_code == 200

    print("baseline auth/user checks passed")
