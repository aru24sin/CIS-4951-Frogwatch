# backend/app/routes/email.py
from fastapi import APIRouter, HTTPException, Query
from fastapi_mail import FastMail, MessageSchema, MessageType
from pydantic import EmailStr, BaseModel
from datetime import datetime

from backend.app.email_config import conf
from backend.firebase import db, admin_auth

router = APIRouter()

# --- existing route, unchanged ---
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

        db.collection("email_logs").add({
            "to": str(to_email),
            "subject": message.subject,
            "body": message.body,
            "status": "sent",
            "sent_at": datetime.utcnow()
        })

        return {"message": f"Email sent to {to_email}"}
    except Exception as e:
        db.collection("email_logs").add({
            "to": str(to_email),
            "subject": "Welcome to FrogWatch+",
            "body": "Thank you for registering with FrogWatch+!",
            "status": f"failed: {str(e)}",
            "sent_at": datetime.utcnow()
        })
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")

# -------- NEW: verify answers then send reset email ----------
class ResetReq(BaseModel):
    email: EmailStr
    answers: list[str]  # [q1, q2, q3]

def _norm(s: str) -> str:
    return (s or "").strip().lower()

@router.post("/auth/verify-and-send-reset")
async def verify_and_send_reset(req: ResetReq):
    """If email + 3 answers match what's in Firestore, email a Firebase reset link.
       Always respond with a generic success to avoid account enumeration."""
    if len(req.answers) != 3:
        raise HTTPException(status_code=400, detail="Need 3 answers")

    generic = {"status": "ok"}  # what we always return

    try:
        # 1) Find user by email with Admin SDK
        user = admin_auth.get_user_by_email(str(req.email))
        uid = user.uid

        # 2) Load stored security answers
        snap = db.collection("users").document(uid).get()
        if not snap.exists:
            return generic
        sec = (snap.to_dict() or {}).get("security", {})

        # 3) Constant-time-ish compare (normalized)
        ok = (
            _norm(req.answers[0]) == _norm(sec.get("q1")) and
            _norm(req.answers[1]) == _norm(sec.get("q2")) and
            _norm(req.answers[2]) == _norm(sec.get("q3"))
        )
        if not ok:
            return generic

        # 4) Create official Firebase password reset link
        reset_link = admin_auth.generate_password_reset_link(str(req.email))

        # 5) Send via FastMail
        body = (
            "We received a request to reset your FrogWatch+ password.\n\n"
            f"Reset your password using this link:\n{reset_link}\n\n"
            "If you didn't request this, you can ignore this email."
        )
        msg = MessageSchema(
            subject="Reset your FrogWatch+ password",
            recipients=[str(req.email)],
            body=body,
            subtype=MessageType.plain,
        )
        fm = FastMail(conf)
        await fm.send_message(msg)

        # 6) Log event
        db.collection("email_logs").add({
            "to": str(req.email),
            "subject": "Reset your FrogWatch+ password",
            "status": "sent",
            "sent_at": datetime.utcnow()
        })

        return generic
    except HTTPException:
        raise
    except Exception as e:
        # optional: log failure; still return generic success
        try:
            db.collection("email_logs").add({
                "to": str(req.email),
                "subject": "Reset your FrogWatch+ password",
                "status": f"failed: {str(e)}",
                "sent_at": datetime.utcnow()
            })
        except Exception:
            pass
        return generic
