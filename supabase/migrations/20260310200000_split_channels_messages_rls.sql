-- Split RLS policies for channels and messages to enforce appropriate permissions
-- for updating and deleting.

--------------------------------------------------------------------------------
-- 1. CHANNELS
--------------------------------------------------------------------------------

-- Drop the existing monolithic ALL policies
DROP POLICY IF EXISTS "Users access channels in visible workspaces or DMs" ON public.channels;
DROP POLICY IF EXISTS "Users access channels in own workspaces" ON public.channels;

-- SELECT: visible if in the workspace or if it's your DM
CREATE POLICY "Users can view channels"
    ON public.channels FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE user_id = auth.uid()
        )
        OR workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid())
    );

-- INSERT: allowed if in the workspace or creating a DM
CREATE POLICY "Users can create channels"
    ON public.channels FOR INSERT
    TO authenticated
    WITH CHECK (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE user_id = auth.uid()
        )
        OR workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
        OR type = 'dm'
    );

-- UPDATE: ONLY workspace owners can rename channels
CREATE POLICY "Workspace owners can update channels"
    ON public.channels FOR UPDATE
    TO authenticated
    USING (
        workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
        -- Note: DM channels don't technically have "owners", but we don't allow renaming DMs anyway.
    )
    WITH CHECK (
        workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
    );

-- DELETE: ONLY workspace owners can delete channels
CREATE POLICY "Workspace owners can delete channels"
    ON public.channels FOR DELETE
    TO authenticated
    USING (
        workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
    );


--------------------------------------------------------------------------------
-- 2. MESSAGES
--------------------------------------------------------------------------------

-- Drop the existing monolithic ALL policies
DROP POLICY IF EXISTS "Users access messages in visible threads" ON public.messages;
DROP POLICY IF EXISTS "Users access messages in own workspace threads" ON public.messages;

-- SELECT: visible if you have access to the thread (workspace member or channel_member for DM)
CREATE POLICY "Users can view messages"
    ON public.messages FOR SELECT
    TO authenticated
    USING (
        thread_id IN (
            SELECT t.id FROM public.threads t
            WHERE t.workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
            OR t.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
            OR t.channel_id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid())
        )
    );

-- INSERT: allowed if you have access to the thread
CREATE POLICY "Users can create messages"
    ON public.messages FOR INSERT
    TO authenticated
    WITH CHECK (
        thread_id IN (
            SELECT t.id FROM public.threads t
            WHERE t.workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
            OR t.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
            OR t.channel_id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid())
        )
    );

-- UPDATE: ONLY the user who authored the message can update it
CREATE POLICY "Users can update own messages"
    ON public.messages FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- DELETE: ONLY the user who authored the message can delete it
CREATE POLICY "Users can delete own messages"
    ON public.messages FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
