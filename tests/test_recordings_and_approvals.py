# tests/test_recordings_and_approvals.py

import io
import uuid
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_upload_and_get_recording():
    dummy_audio = io.BytesIO(b"abcdef")
    files = {"audio_file": ("a.wav", dummy_audio, "audio/wav")}
    data = {
        "userId": "testUser",   # must match fake user in conftest
        "species": "",
        "latitude": 0,
        "longitude": 0
    }

    r = client.post("/recordings/upload-audio", data=data, files=files)
    assert r.status_code == 200
    rec_id = r.json()["recordingId"]

    r = client.get("/recordings/my")
    assert r.status_code == 200
    ids = [x["recordingId"] for x in r.json()]
    assert rec_id in ids

def test_approval_flow():
    dummy_audio = io.BytesIO(b"abcdef")
    files = {"audio_file": ("tmp.wav", dummy_audio, "audio/wav")}
    data = {
        "userId": "testUser",
        "species": "",
        "latitude": 0,
        "longitude": 0
    }
    up = client.post("/recordings/upload-audio", data=data, files=files)
    assert up.status_code == 200
    rec_id = up.json()["recordingId"]

    approval_payload = {
        "approvalId": str(uuid.uuid4()),
        "expertId": "testUser",
        "recordingId": rec_id,
        "approved": True,
        "confidenceScore": 90.0,
        "trustedLabel": "Green Frog",
        "comments": "ok"
    }
    r = client.post("/approvals/", json=approval_payload)
    assert r.status_code == 200
