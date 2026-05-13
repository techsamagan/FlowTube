from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./ytmanager.db"

    # AI — core
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # AI — video generation models
    kling_access_key: str = ""   # Kling AI (api.klingai.com)
    kling_secret_key: str = ""
    google_ai_api_key: str = ""  # Google AI Studio → Veo 2

    # YouTube OAuth (Google Cloud Console credentials)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8001/api/auth/youtube/callback"

    # Encryption key for OAuth tokens (generate with: Fernet.generate_key())
    encryption_key: str = ""

    # Storage
    storage_dir: str = "./storage"

    # Frontend URL (used for OAuth redirect after connect)
    frontend_url: str = "http://localhost:3001"

    # SMTP — for email verification
    email_host: str = "smtp.gmail.com"
    email_port: int = 587
    email_user: str = ""
    email_password: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
