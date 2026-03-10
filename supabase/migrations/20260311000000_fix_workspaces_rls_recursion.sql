-- Fix infinite recursion: workspaces <-> workspace_members RLS cycle.
-- Use SECURITY DEFINER function so it bypasses RLS (no recursion).

CREATE OR REPLACE FUNCTION public.get_my_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM public.workspaces WHERE user_id = auth.uid()
  UNION
  SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid();
$$;

-- Grant execute to authenticated (needed for RLS policy evaluation)
GRANT EXECUTE ON FUNCTION public.get_my_workspace_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_workspace_ids() TO service_role;

-- workspaces: use function instead of direct workspace_members subquery
DROP POLICY IF EXISTS "Users full access own workspaces" ON public.workspaces;
CREATE POLICY "Users full access own workspaces"
    ON public.workspaces FOR ALL
    TO authenticated
    USING (id IN (SELECT get_my_workspace_ids()))
    WITH CHECK (user_id = auth.uid());

-- workspace_members: use function instead of direct workspaces subquery
DROP POLICY IF EXISTS "Users manage workspace_members in their workspaces" ON public.workspace_members;
CREATE POLICY "Users manage workspace_members in their workspaces"
    ON public.workspace_members FOR ALL
    TO authenticated
    USING (workspace_id IN (SELECT get_my_workspace_ids()) OR user_id = auth.uid())
    WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()) OR user_id = auth.uid());
