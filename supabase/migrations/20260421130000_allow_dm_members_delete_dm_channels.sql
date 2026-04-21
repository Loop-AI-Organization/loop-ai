-- Allow DM participants to delete DM channels, even when they are not workspace owners.
-- Keep project-channel deletion restricted to workspace owners.

DROP POLICY IF EXISTS "Workspace owners can delete channels" ON public.channels;
DROP POLICY IF EXISTS "Users can delete channels" ON public.channels;

CREATE POLICY "Users can delete channels"
    ON public.channels FOR DELETE
    TO authenticated
    USING (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE user_id = auth.uid()
        )
        OR (
            type = 'dm'
            AND id IN (
                SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid()
            )
        )
    );