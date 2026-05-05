-- Fix RLS ownership/member checks for workspaces/channels.
-- This handles projects where ownership may live in either workspaces.user_id
-- or workspaces.owner_id, and ensures channel inserts pass for authorized users.

CREATE OR REPLACE FUNCTION public.get_my_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id
  FROM public.workspaces
  WHERE user_id = auth.uid() OR owner_id = auth.uid()
  UNION
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_workspace_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_workspace_ids() TO service_role;

-- workspaces
DROP POLICY IF EXISTS "Users full access own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can view own or member workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can create workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can update own workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can delete own workspaces" ON public.workspaces;

CREATE POLICY "Users can view own or member workspaces"
  ON public.workspaces FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY "Users can create workspaces"
  ON public.workspaces FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR owner_id = auth.uid());

CREATE POLICY "Users can update own workspaces"
  ON public.workspaces FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR owner_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR owner_id = auth.uid());

CREATE POLICY "Users can delete own workspaces"
  ON public.workspaces FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR owner_id = auth.uid());

-- workspace_members
DROP POLICY IF EXISTS "Users manage workspace_members in their workspaces" ON public.workspace_members;

CREATE POLICY "Users manage workspace_members in their workspaces"
  ON public.workspace_members FOR ALL
  TO authenticated
  USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    workspace_id IN (SELECT public.get_my_workspace_ids())
    OR user_id = auth.uid()
  );

-- channels
DROP POLICY IF EXISTS "Users access channels in visible workspaces or DMs" ON public.channels;
DROP POLICY IF EXISTS "Users access channels in own workspaces" ON public.channels;
DROP POLICY IF EXISTS "Users can view channels" ON public.channels;
DROP POLICY IF EXISTS "Users can create channels" ON public.channels;
DROP POLICY IF EXISTS "Workspace owners can update channels" ON public.channels;
DROP POLICY IF EXISTS "Workspace owners can delete channels" ON public.channels;

CREATE POLICY "Users can view channels"
  ON public.channels FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = channels.workspace_id
        AND (w.user_id = auth.uid() OR w.owner_id = auth.uid())
    )
    OR channels.workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    OR channels.id IN (
      SELECT channel_id
      FROM public.channel_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create channels"
  ON public.channels FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = channels.workspace_id
        AND (w.user_id = auth.uid() OR w.owner_id = auth.uid())
    )
    OR channels.workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
    OR channels.type = 'dm'
  );

CREATE POLICY "Workspace owners can update channels"
  ON public.channels FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = channels.workspace_id
        AND (w.user_id = auth.uid() OR w.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = channels.workspace_id
        AND (w.user_id = auth.uid() OR w.owner_id = auth.uid())
    )
  );

CREATE POLICY "Workspace owners can delete channels"
  ON public.channels FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = channels.workspace_id
        AND (w.user_id = auth.uid() OR w.owner_id = auth.uid())
    )
  );
