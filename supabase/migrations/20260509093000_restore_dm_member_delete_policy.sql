-- Restore DM participant deletion rights while keeping project-channel deletion owner-only.

DROP POLICY IF EXISTS "Users can delete channels" ON public.channels;
DROP POLICY IF EXISTS "Workspace owners can delete channels" ON public.channels;

CREATE POLICY "Users can delete channels"
  ON public.channels
  FOR DELETE
  TO authenticated
  USING (
    (
      channels.type = 'project'
      AND EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.id = channels.workspace_id
          AND (w.user_id = auth.uid() OR w.owner_id = auth.uid())
      )
    )
    OR (
      channels.type = 'dm'
      AND channels.id IN (
        SELECT cm.channel_id
        FROM public.channel_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  );
