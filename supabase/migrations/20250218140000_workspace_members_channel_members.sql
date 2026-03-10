-- workspace_members: who belongs to a workspace (owner + invited)
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members(user_id);

-- channel_members: for DM channels, the two participants
CREATE TABLE IF NOT EXISTS public.channel_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_channel_id ON public.channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user_id ON public.channel_members(user_id);

-- Backfill: add creator as owner for existing workspaces
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT id, user_id, 'owner'
FROM public.workspaces w
WHERE NOT EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = w.user_id);

-- RLS: workspace_members (no self-reference to avoid infinite recursion)
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage workspace_members in their workspaces"
    ON public.workspace_members FOR ALL
    TO authenticated
    USING (
        workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
        OR user_id = auth.uid()
    )
    WITH CHECK (
        workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
        OR user_id = auth.uid()
    );

-- RLS: channel_members
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage channel_members for channels they can access"
    ON public.channel_members FOR ALL
    TO authenticated
    USING (
        channel_id IN (
            SELECT id FROM public.channels c
            WHERE c.workspace_id IN (
                SELECT id FROM public.workspaces WHERE user_id = auth.uid()
            )
            OR c.workspace_id IN (
                SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
            )
        )
        OR user_id = auth.uid()
    )
    WITH CHECK (
        channel_id IN (
            SELECT id FROM public.channels c
            WHERE c.workspace_id IN (
                SELECT id FROM public.workspaces WHERE user_id = auth.uid()
            )
            OR c.workspace_id IN (
                SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
            )
        )
        OR user_id = auth.uid()
    );

-- Update workspaces RLS: users can see workspaces they own OR are members of
DROP POLICY IF EXISTS "Users full access own workspaces" ON public.workspaces;

CREATE POLICY "Users full access own workspaces"
    ON public.workspaces FOR ALL
    TO authenticated
    USING (
        user_id = auth.uid()
        OR id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    )
    WITH CHECK (user_id = auth.uid());

-- Update channels RLS: users can see channels in workspaces they have access to, OR DM channels they are in
DROP POLICY IF EXISTS "Users access channels in own workspaces" ON public.channels;

CREATE POLICY "Users access channels in visible workspaces or DMs"
    ON public.channels FOR ALL
    TO authenticated
    USING (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE user_id = auth.uid()
        )
        OR workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid())
    )
    WITH CHECK (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE user_id = auth.uid()
        )
        OR workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Update threads RLS: allow access for workspace members and DM channel members
DROP POLICY IF EXISTS "Users access threads in own workspaces" ON public.threads;

CREATE POLICY "Users access threads in visible workspaces or DMs"
    ON public.threads FOR ALL
    TO authenticated
    USING (
        (workspace_id IN (
            SELECT id FROM public.workspaces WHERE user_id = auth.uid()
        )
        OR workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        ))
        OR (channel_id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid()))
    )
    WITH CHECK (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE user_id = auth.uid()
        )
        OR workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Update messages RLS: allow access when user has access to thread (workspace member or channel_member for DM)
DROP POLICY IF EXISTS "Users access messages in own workspace threads" ON public.messages;

CREATE POLICY "Users access messages in visible threads"
    ON public.messages FOR ALL
    TO authenticated
    USING (
        thread_id IN (
            SELECT t.id FROM public.threads t
            WHERE t.workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
            OR t.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
            OR t.channel_id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid())
        )
    )
    WITH CHECK (
        thread_id IN (
            SELECT t.id FROM public.threads t
            WHERE t.workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
            OR t.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
            OR t.channel_id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid())
        )
    );
