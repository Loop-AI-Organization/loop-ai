-- Workspaces: one per user (user_id = owner)
CREATE TABLE IF NOT EXISTS public.workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT 'My Workspace',
    icon text NOT NULL DEFAULT '◎',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON public.workspaces(user_id);

-- Channels: belong to a workspace
CREATE TABLE IF NOT EXISTS public.channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL DEFAULT 'project' CHECK (type IN ('project', 'dm')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channels_workspace_id ON public.channels(workspace_id);

-- Add workspace_id, channel_id, title to threads (nullable for existing rows)
ALTER TABLE public.threads
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS title text DEFAULT 'Untitled';

CREATE INDEX IF NOT EXISTS idx_threads_workspace_id ON public.threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_threads_channel_id ON public.threads(channel_id);

-- Messages: belong to a thread
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages(thread_id);

-- RLS: workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users full access own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Service role full access on workspaces" ON public.workspaces;

CREATE POLICY "Users full access own workspaces"
    ON public.workspaces FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on workspaces"
    ON public.workspaces FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- RLS: channels
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access channels in own workspaces" ON public.channels;
DROP POLICY IF EXISTS "Service role full access on channels" ON public.channels;

CREATE POLICY "Users access channels in own workspaces"
    ON public.channels FOR ALL
    TO authenticated
    USING (
        workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
    )
    WITH CHECK (
        workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
    );

CREATE POLICY "Service role full access on channels"
    ON public.channels FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- RLS: threads (replace previous permissive policies for authenticated)
DROP POLICY IF EXISTS "Allow read threads" ON public.threads;
DROP POLICY IF EXISTS "Users access threads in own workspaces" ON public.threads;

CREATE POLICY "Users access threads in own workspaces"
    ON public.threads FOR ALL
    TO authenticated
    USING (
        workspace_id IS NOT NULL
        AND workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
    )
    WITH CHECK (
        workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
    );

-- RLS: messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access messages in own workspace threads" ON public.messages;
DROP POLICY IF EXISTS "Service role full access on messages" ON public.messages;

CREATE POLICY "Users access messages in own workspace threads"
    ON public.messages FOR ALL
    TO authenticated
    USING (
        thread_id IN (
            SELECT t.id FROM public.threads t
            WHERE t.workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
        )
    )
    WITH CHECK (
        thread_id IN (
            SELECT t.id FROM public.threads t
            WHERE t.workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "Service role full access on messages"
    ON public.messages FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
