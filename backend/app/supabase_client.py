from supabase import create_client, Client
from .config import get_settings

s = get_settings()
# Normalize URL (no trailing slash) to avoid request issues
supabase_url = str(s.supabase_url).rstrip("/")
supabase: Client = create_client(
    supabase_url,
    s.supabase_service_role_key,
    options={"auth": {"auto_refresh_token": False, "persist_session": False}},
)
