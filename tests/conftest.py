# tests/conftest.py
import pytest

@pytest.fixture(autouse=True)
def bypass_auth(monkeypatch):
    """
    Replace all get_current_user calls with a fake user
    and also disable the security dependency so protected
    routes don't reject the request.
    """
    def fake_user():
        return {"uid": "testUser", "role": "admin", "email": "test@frogwatch.com"}

    # Patch every router that imports get_current_user
    monkeypatch.setattr("backend.app.routes.auth.get_current_user", fake_user)
    monkeypatch.setattr("backend.app.routes.recordings.get_current_user", fake_user)
    monkeypatch.setattr("backend.app.routes.users.get_current_user", fake_user)
    monkeypatch.setattr("backend.app.routes.approvals.get_current_user", fake_user)
    monkeypatch.setattr("backend.app.routes.feedback.get_current_user", fake_user)

    # Now also disable the FastAPI HTTPBearer security dependency itself
    # so requests hit the router without needing an Authorization header.
    from backend.app import main as main_module
    monkeypatch.setattr(main_module, "security", lambda: None)
