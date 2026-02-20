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

-- auth_events: login/sign-in metrics
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

-- Workspaces, channels, messages (per-user data)
CREATE TABLE IF NOT EXISTS public.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT 'My Workspace',
    icon text NOT NULL DEFAULT '◎',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON public.workspaces(user_id);

CREATE TABLE IF NOT EXISTS public.channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL DEFAULT 'project' CHECK (type IN ('project', 'dm')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channels_workspace_id ON public.channels(workspace_id);

ALTER TABLE public.threads
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS title text DEFAULT 'Untitled';
CREATE INDEX IF NOT EXISTS idx_threads_workspace_id ON public.threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_threads_channel_id ON public.threads(channel_id);

CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages(thread_id);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read threads" ON public.threads;
DROP POLICY IF EXISTS "Users access threads in own workspaces" ON public.threads;
CREATE POLICY "Users access threads in own workspaces"
    ON public.threads FOR ALL TO authenticated
    USING (workspace_id IS NOT NULL AND workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid()))
    WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users full access own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Service role full access on workspaces" ON public.workspaces;
CREATE POLICY "Users full access own workspaces" ON public.workspaces FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role full access on workspaces" ON public.workspaces FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users access channels in own workspaces" ON public.channels;
DROP POLICY IF EXISTS "Service role full access on channels" ON public.channels;
CREATE POLICY "Users access channels in own workspaces" ON public.channels FOR ALL TO authenticated
    USING (workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid()))
    WITH CHECK (workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid()));
CREATE POLICY "Service role full access on channels" ON public.channels FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users access messages in own workspace threads" ON public.messages;
DROP POLICY IF EXISTS "Service role full access on messages" ON public.messages;
CREATE POLICY "Users access messages in own workspace threads" ON public.messages FOR ALL TO authenticated
    USING (thread_id IN (SELECT t.id FROM public.threads t WHERE t.workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())))
    WITH CHECK (thread_id IN (SELECT t.id FROM public.threads t WHERE t.workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())));
CREATE POLICY "Service role full access on messages" ON public.messages FOR ALL TO service_role USING (true) WITH CHECK (true);
