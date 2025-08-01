from fastapi import APIRouter, Query
from fastapi_mail import FastMail, MessageSchema
from backend.app.email_config import conf

router = APIRouter()

@router.post("/send-email/")
async def send_email(to_email: str = Query(...)):
    message = MessageSchema(
        subject="Welcome to FrogWatch+",
        recipients=[to_email],
        body="Thank you for registering with FrogWatch+!",
        subtype="plain"
    )

    fm = FastMail(conf)
    await fm.send_message(message)
    return {"message": f"Email sent to {to_email}"}
