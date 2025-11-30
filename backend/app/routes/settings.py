# backend/app/routes/settings.py

from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend import firebase
from backend.app.routes.auth import get_current_user

router = APIRouter(prefix="/settings", tags=["Settings"])
CurrentUser = Dict[str, Any]


# --------- Pydantic Models ---------

class NotificationSettings(BaseModel):
    push: bool = True
    email: bool = True
    recording_updates: bool = True
    expert_responses: bool = True
    weekly_digest: bool = False
    sounds: bool = True


class PermissionSettings(BaseModel):
    location_always: bool = False
    location_while_using: bool = True
    microphone: bool = True
    camera: bool = True
    photo_library: bool = True


class PrivacySettings(BaseModel):
    profile_visible: bool = True
    show_location: bool = True
    show_recordings: bool = True
    data_collection: bool = True


class PreferenceSettings(BaseModel):
    dark_mode: bool = True
    autoplay_audio: bool = False
    high_quality_audio: bool = True
    language: str = "en"
    units: str = "metric"  # "metric" | "imperial"


class ExpertAccessSettings(BaseModel):
    requested: bool = False
    approved: bool = False


class UserSettings(BaseModel):
    notifications: NotificationSettings = NotificationSettings()
    permissions: PermissionSettings = PermissionSettings()
    privacy: PrivacySettings = PrivacySettings()
    preferences: PreferenceSettings = PreferenceSettings()
    expert_access: ExpertAccessSettings = ExpertAccessSettings()


class UserSettingsUpdate(BaseModel):
    """Partial update – all fields optional."""
    notifications: Optional[NotificationSettings] = None
    permissions: Optional[PermissionSettings] = None
    privacy: Optional[PrivacySettings] = None
    preferences: Optional[PreferenceSettings] = None
    expert_access: Optional[ExpertAccessSettings] = None


# --------- Helpers ---------

def _settings_doc_ref(uid: str):
    return firebase.db.collection("settings").document(uid)


# --------- Endpoints ---------

@router.get("/", response_model=UserSettings)
def get_user_settings(user: CurrentUser = Depends(get_current_user)):
    """Fetch all settings for the logged-in user."""
    doc = _settings_doc_ref(user["uid"]).get()
    if not doc.exists:
        # no doc yet → return defaults so UI has something usable
        return UserSettings()
    return UserSettings(**doc.to_dict())


@router.patch("/", response_model=UserSettings)
def update_user_settings(
    payload: UserSettingsUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Update user settings. Frontend can send only the parts it changed, e.g.:

    {
      "preferences": { "dark_mode": true }
    }
    """
    data = payload.dict(exclude_unset=True)
    ref = _settings_doc_ref(user["uid"])
    ref.set(data, merge=True)

    # return the merged settings
    updated = ref.get().to_dict() or {}
    return UserSettings(**updated)


@router.delete("/", response_model=UserSettings)
def reset_user_settings(user: CurrentUser = Depends(get_current_user)):
    """
    Reset settings back to defaults for this user.
    (You could also `delete()` if you prefer; here we overwrite with defaults.)
    """
    defaults = UserSettings().dict()
    ref = _settings_doc_ref(user["uid"])
    ref.set(defaults)
    return UserSettings(**defaults)
