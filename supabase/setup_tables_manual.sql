-- Loop AI: threads and actions tables + RLS (idempotent)
-- Run this in Supabase Dashboard → SQL Editor if you are not using the CLI (db push).

-- threads: conversation/workspace threads
CREATE TABLE IF NOT EXISTS public.threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- actions: queued actions per thread (status updated by worker)
CREATE TABLE IF NOT EXISTS public.actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
    label text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    result jsonb,
    error text
);

CREATE INDEX IF NOT EXISTS idx_actions_thread_id ON public.actions(thread_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON public.actions(status);

-- RLS: enable on both tables
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies so this script can be re-run safely
DROP POLICY IF EXISTS "Service role full access on threads" ON public.threads;
DROP POLICY IF EXISTS "Service role full access on actions" ON public.actions;
DROP POLICY IF EXISTS "Allow read threads" ON public.threads;
DROP POLICY IF EXISTS "Allow read actions" ON public.actions;

-- Service role and authenticated can do everything (backend uses service_role key)
CREATE POLICY "Service role full access on threads"
    ON public.threads FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on actions"
    ON public.actions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow anon/authenticated to read for now (optional; tighten when you add Auth)
CREATE POLICY "Allow read threads"
    ON public.threads FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow read actions"
    ON public.actions FOR SELECT
    TO anon, authenticated
    USING (true);
