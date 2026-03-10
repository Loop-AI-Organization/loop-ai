-- Fix workspaces RLS: split FOR ALL into per-operation policies so that
-- INSERT works correctly, and use a SECURITY DEFINER helper to restore
-- member visibility on SELECT without causing infinite recursion.

-- 1) Helper: returns workspace IDs the current user is a member of.
--    SECURITY DEFINER bypasses RLS, breaking the recursion cycle
--    (workspace_members policy references workspaces, but this function
--    reads workspace_members without triggering its RLS).
CREATE OR REPLACE FUNCTION public.get_my_member_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
$$;

-- 2) Drop the existing ALL policy
DROP POLICY IF EXISTS "Users full access own workspaces" ON public.workspaces;

-- 3) SELECT: owner OR member
CREATE POLICY "Users can view own or member workspaces"
    ON public.workspaces FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR id IN (SELECT public.get_my_member_workspace_ids())
    );

-- 4) INSERT: only if setting yourself as owner
CREATE POLICY "Users can create workspaces"
    ON public.workspaces FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- 5) UPDATE: only your own workspaces
CREATE POLICY "Users can update own workspaces"
    ON public.workspaces FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 6) DELETE: only your own workspaces
CREATE POLICY "Users can delete own workspaces"
    ON public.workspaces FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
