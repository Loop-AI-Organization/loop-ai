from functools import lru_cache
from pathlib import Path
from pydantic import AnyUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env at project root (parent of backend/app)
_env_path = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_path,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: AnyUrl
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str = ""  # Legacy; unused — backend uses Supabase signing keys (JWKS) to verify tokens
    redis_url: str = "redis://localhost:6379"
    port: int = 4000
    cors_origin: str = ""  # Optional extra origin(s), comma-separated; localhost dev origins are always allowed
    site_url: str = "http://localhost:5173"  # Frontend base URL for invite redirects (no trailing slash)

@lru_cache
def get_settings():
    return Settings()
