from fastapi import APIRouter
from fastapi_mail import FastMail, MessageSchema
from backend.app.email_config import conf

router = APIRouter()

@router.post("/send-email/")
async def send_email(to_email: str):
    message = MessageSchema(
        subject="FrogWatch+ Notification",
        recipients=[to_email],
        body="This is a test email from your FastAPI app.",
        subtype="plain"
    )

    fm = FastMail(conf)
    await fm.send_message(message)
    return {"message": f"Email sent to {to_email}"}