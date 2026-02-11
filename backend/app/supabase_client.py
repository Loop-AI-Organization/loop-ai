from supabase import create_client, Client
from .config import get_settings

s = get_settings()
supabase: Client = create_client(
    s.supabase_url,
    s.supabase_service_role_key,
    options={"auth": {"auto_refresh_token": False, "persist_session": False}},
)
