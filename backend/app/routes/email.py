from fastapi import APIRouter, HTTPException, Query
from fastapi_mail import FastMail, MessageSchema, MessageType
from pydantic import EmailStr
from datetime import datetime
from backend.app.email_config import conf
from backend.firebase import db

router = APIRouter()

@router.post("/send-email/")
async def send_email(to_email: EmailStr = Query(...)):
    try:
        message = MessageSchema(
            subject="Welcome to FrogWatch+",
            recipients=[to_email],
            body="Thank you for registering with FrogWatch+!",
            subtype=MessageType.plain
        )

        fm = FastMail(conf)
        await fm.send_message(message)

        # Log the email event in Firestore
        email_log = {
            "to": to_email,
            "subject": message.subject,
            "body": message.body,
            "status": "sent",  # You could later set this to 'failed' in an exception block
            "sent_at": datetime.utcnow()
        }

        db.collection("email_logs").add(email_log)

        return {"message": f"Email sent to {to_email}"}

    except Exception as e:
        # Log failure (optional)
        db.collection("email_logs").add({
            "to": to_email,
            "subject": "Welcome to FrogWatch+",
            "body": "Thank you for registering with FrogWatch+!",
            "status": f"failed: {str(e)}",
            "sent_at": datetime.utcnow()
        })

        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")