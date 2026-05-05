-- Loop AI: Full schema setup (idempotent)
-- Run this in Supabase Dashboard → SQL Editor if you are not using the CLI (db push).
-- This file reflects the cumulative state of all migrations.

-- ========================================================================
-- Extensions
-- ========================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ========================================================================
-- Tables
-- ========================================================================

-- threads: conversation/workspace threads
CREATE TABLE IF NOT EXISTS public.threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    workspace_id uuid,
    channel_id uuid,
    title text DEFAULT 'Untitled',
    user_id uuid
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

-- workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT 'My Workspace',
    icon text NOT NULL DEFAULT '◎',
    created_at timestamptz NOT NULL DEFAULT now(),
    share_code text UNIQUE,
    summary text,
    summary_updated_at timestamptz
);

-- channels
CREATE TABLE IF NOT EXISTS public.channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL DEFAULT 'project' CHECK (type IN ('project', 'dm')),
    created_at timestamptz NOT NULL DEFAULT now(),
    is_llm_restricted boolean NOT NULL DEFAULT false,
    llm_participation_enabled boolean NOT NULL DEFAULT true,
    dm_pair_key text,
    summary text,
    summary_updated_at timestamptz
);

-- Add FK references that depend on workspaces/channels existing
ALTER TABLE public.threads
    ADD CONSTRAINT IF NOT EXISTS threads_workspace_id_fkey
        FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.threads
    ADD CONSTRAINT IF NOT EXISTS threads_channel_id_fkey
        FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;
ALTER TABLE public.threads
    ADD CONSTRAINT IF NOT EXISTS threads_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- messages
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content text NOT NULL DEFAULT '',
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    user_display_name text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- auth_events: login/sign-in metrics
CREATE TABLE IF NOT EXISTS public.auth_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- workspace_members
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

-- channel_members
CREATE TABLE IF NOT EXISTS public.channel_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (channel_id, user_id)
);

-- files: workspace-scoped file records (replaces thread_files)
CREATE TABLE IF NOT EXISTS public.files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'generated')),
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL DEFAULT 0,
    content_type text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    summary text,
    project_context text,
    tags text[],
    metadata_status text NOT NULL DEFAULT 'pending' CHECK (metadata_status IN ('pending', 'ready', 'failed')),
    source_channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL
);

-- ========================================================================
-- Indexes
-- ========================================================================
CREATE INDEX IF NOT EXISTS idx_actions_thread_id ON public.actions(thread_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON public.actions(status);
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON public.workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_workspace_id ON public.channels(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_workspace_dm_pair_key
    ON public.channels(workspace_id, dm_pair_key)
    WHERE type = 'dm' AND dm_pair_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channels_llm_participation ON public.channels(llm_participation_enabled);
CREATE INDEX IF NOT EXISTS idx_channels_llm_restricted ON public.channels(is_llm_restricted);
CREATE INDEX IF NOT EXISTS idx_threads_workspace_id ON public.threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_threads_channel_id ON public.threads(channel_id);
CREATE INDEX IF NOT EXISTS idx_threads_user_id ON public.threads(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_user_id ON public.auth_events(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_created_at ON public.auth_events(created_at);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON public.channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_files_workspace_id ON public.files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_files_created_by ON public.files(created_by);
CREATE INDEX IF NOT EXISTS idx_files_source_channel_id ON public.files(source_channel_id);
CREATE INDEX IF NOT EXISTS idx_files_tags ON public.files USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_files_metadata_status ON public.files(metadata_status);

-- ========================================================================
-- RLS
-- ========================================================================
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Service role: full access on all tables
CREATE POLICY "Service role full access on threads" ON public.threads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on actions" ON public.actions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on workspaces" ON public.workspaces FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on channels" ON public.channels FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on messages" ON public.messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on auth_events" ON public.auth_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on workspace_members" ON public.workspace_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on channel_members" ON public.channel_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on files" ON public.files FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Note: Per-user RLS policies are managed by the individual migration files.
-- See the migrations directory for the full set of per-operation policies.
