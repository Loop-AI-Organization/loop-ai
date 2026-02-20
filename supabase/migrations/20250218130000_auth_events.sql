-- Login/sign-in metrics: auth_events table
CREATE TABLE IF NOT EXISTS public.auth_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_id ON public.auth_events(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_created_at ON public.auth_events(created_at);

ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on auth_events" ON public.auth_events;
DROP POLICY IF EXISTS "Authenticated user insert own auth_events" ON public.auth_events;

CREATE POLICY "Service role full access on auth_events"
    ON public.auth_events FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated user insert own auth_events"
    ON public.auth_events FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
