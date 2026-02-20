import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const _client: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/** Supabase client; null when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. */
export const supabase = _client;

/** Returns the Supabase client or throws if not configured. Use in app code that only runs when isSupabaseConfigured is true. */
export function getSupabase(): SupabaseClient {
  if (!_client) {
    throw new Error('Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env (or run node scripts/sync-env.js).');
  }
  return _client;
}

/** Get the current session's access token for backend API calls. */
export async function getAccessToken(): Promise<string | null> {
  if (!_client) return null;
  const { data: { session } } = await _client.auth.getSession();
  return session?.access_token ?? null;
}

/** Headers to send with authenticated backend requests. */
export async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
