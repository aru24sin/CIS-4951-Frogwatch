# backend/utils/push.py

import firebase_admin
from firebase_admin import messaging

def send_push(token: str, title: str, body: str):
    """
    Sends a basic FCM push notification to a single device.

    Args:
        token (str): FCM "device token" from the phone.
        title (str): Notification title.
        body  (str): Notification body text.
    """
    # Ensure Firebase Admin is initialized
    if not firebase_admin._apps:
        firebase_admin.initialize_app()

    message = messaging.Message(
        notification=messaging.Notification(
            title=title,
            body=body
        ),
        token=token
    )

    try:
        response = messaging.send(message)
        print("FCM push sent:", response)
        return response
    except Exception as e:
        print("FCM push error:", e)
        return None
