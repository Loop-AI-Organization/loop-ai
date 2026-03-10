-- Fix infinite recursion when new users (no workspaces yet) hit workspace_members.
-- Cycle was: workspace_members policy -> get_my_workspace_ids() -> reads workspace_members
-- -> RLS runs again -> recursion.
--
-- Break the cycle: workspaces must NOT reference workspace_members. Then
-- workspace_members can safely reference workspaces (one-way only).

-- 1) workspaces: only "see workspaces you own" (no reference to workspace_members)
DROP POLICY IF EXISTS "Users full access own workspaces" ON public.workspaces;

CREATE POLICY "Users full access own workspaces"
    ON public.workspaces FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 2) workspace_members: "see rows for workspaces you own, or your own membership rows"
--    Only reads workspaces (which no longer references workspace_members), so no cycle.
DROP POLICY IF EXISTS "Users manage workspace_members in their workspaces" ON public.workspace_members;

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
