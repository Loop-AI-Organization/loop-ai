from supabase import create_client, Client
from .config import get_settings

try:
    from supabase import ClientOptions
except ImportError:
    from supabase.lib.client_options import ClientOptions

s = get_settings()
# Normalize URL (no trailing slash) to avoid request issues
supabase_url = str(s.supabase_url).rstrip("/")
# Must use ClientOptions instance; passing a dict causes AttributeError: 'dict' has no attribute 'headers'
options = ClientOptions(auto_refresh_token=False, persist_session=False)
supabase: Client = create_client(supabase_url, s.supabase_service_role_key, options=options)
