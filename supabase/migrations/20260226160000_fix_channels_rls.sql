-- Fix channels RLS policy to allow DM channel creation

-- The previous policy didn't allow creating DM channels because the `WITH CHECK`
-- clause only checked workspace membership, but DMs aren't necessarily strictly
-- tied to workspace membership at the exact moment of creation, and you might
-- just be creating a channel where you are one of the channel_members.
-- The most robust fix is to allow creation if the user is in the workspace OR
-- if it's a DM, allow them to create it (and channel_members RLS will protect who gets added).

DROP POLICY IF EXISTS "Users access channels in visible workspaces or DMs" ON public.channels;
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
        OR type = 'dm'
    );
