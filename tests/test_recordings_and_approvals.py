# tests/test_recordings_and_approvals.py

import io
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

    return {"Authorization": f"Bearer {token}"}


def test_upload_and_get_recording():
    headers = get_auth_headers()
    dummy_audio = io.BytesIO(b"abcdef")
    files = {"audio_file": ("a.wav", dummy_audio, "audio/wav")}
    data = {"species": "", "latitude": 0, "longitude": 0}

    r = client.post("/recordings/upload-audio", data=data, files=files, headers=headers)
    assert r.status_code == 200, r.text
    rec_id = r.json()["recordingId"]

    r = client.get("/recordings/my", headers=headers)
    assert r.status_code == 200, r.text
    ids = [x["recordingId"] for x in r.json()]
    assert rec_id in ids


def test_approval_flow():
    headers = get_auth_headers(role="expert")  # 👈 expert role for approvals
    dummy_audio = io.BytesIO(b"abcdef")
    files = {"audio_file": ("tmp.wav", dummy_audio, "audio/wav")}
    data = {"species": "", "latitude": 0, "longitude": 0}

    up = client.post("/recordings/upload-audio", data=data, files=files, headers=headers)
    assert up.status_code == 200, up.text
    rec_id = up.json()["recordingId"]

    approval_payload = {
        "approvalId": str(uuid.uuid4()),
        "expertId": "pytest_expert",
        "recordingId": rec_id,
        "approved": True,
        "confidenceScore": 90.0,
        "trustedLabel": "Green Frog",
        "comments": "ok"
    }
    r = client.post("/approvals/", json=approval_payload, headers=headers)
    assert r.status_code == 200, r.text