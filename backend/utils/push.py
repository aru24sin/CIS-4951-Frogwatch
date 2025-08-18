# backend/utils/push.py

import firebase_admin
from firebase_admin import messaging

def send_push(token: str, title: str, body: str):
    """
    Send a basic push notification through Firebase Cloud Messaging (FCM).
    The device must have registered its fcmToken first.

    Args:
        token: The device FCM token (string)
        title: Notification title
        body: Notification body
    """
    # Build the message payload
    message = messaging.Message(
        token=token,
        notification=messaging.Notification(
            title=title,
            body=body,
        ),
    )

    try:
        response = messaging.send(message)
        print("Push sent:", response)
    except Exception as e:
        print("Failed to send push:", e)
