from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import EmailStr
from fastapi_mail import ConnectionConfig

class Settings(BaseSettings):
    MAIL_USERNAME: str
    MAIL_PASSWORD: str
    MAIL_FROM: EmailStr
    MAIL_FROM_NAME: str = "FrogWatch+"
    MAIL_PORT: int
    MAIL_SERVER: str
    MAIL_STARTTLS: bool
    MAIL_SSL_TLS: bool
    USE_CREDENTIALS: bool = True
    VALIDATE_CERTS: bool

    # NEW: present in .env but not used here; make it harmless
    FIREBASE_WEB_API_KEY: str | None = None

    # NEW: tell Pydantic where the .env is and to ignore unknown keys
    model_config = SettingsConfigDict(env_file="backend/.env", extra="ignore")
    # If your .env is actually in the project root, use: env_file=".env"

settings = Settings()
print("📧 Loaded EMAIL:", settings.MAIL_USERNAME)

conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_STARTTLS=settings.MAIL_STARTTLS,
    MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
    USE_CREDENTIALS=settings.USE_CREDENTIALS,
    VALIDATE_CERTS=settings.VALIDATE_CERTS,
)
