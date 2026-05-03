-- Tasks (channel-scoped, multi-assignee, with audit log).

-- 1. tasks
CREATE TABLE IF NOT EXISTS public.tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'open', 'in_progress', 'done', 'blocked')),
    due_date timestamptz,
    source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_channel_id ON public.tasks(channel_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON public.tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);

-- 2. task_assignees (multi-assignee join table; display_name always set, user_id nullable for unmatched names)
CREATE TABLE IF NOT EXISTS public.task_assignees (
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    display_name text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, display_name)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON public.task_assignees(user_id);

-- 3. task_events (audit log)
CREATE TABLE IF NOT EXISTS public.task_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('created', 'confirmed', 'status_changed', 'assignee_added', 'assignee_removed', 'edited', 'rejected')),
    actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON public.task_events(task_id, created_at DESC);

-- 4. Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.tasks_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.tasks_set_updated_at();

-- 5. RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

-- tasks
CREATE POLICY "Service role full access on tasks"
    ON public.tasks FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Users view tasks in their workspaces"
    ON public.tasks FOR SELECT TO authenticated
    USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY "Users create tasks in their workspaces"
    ON public.tasks FOR INSERT TO authenticated
    WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

-- Anyone in the workspace can update/confirm tasks (per product decision: anyone can confirm pending tasks)
CREATE POLICY "Workspace members update tasks"
    ON public.tasks FOR UPDATE TO authenticated
    USING (workspace_id IN (SELECT get_my_workspace_ids()))
    WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY "Workspace members delete tasks"
    ON public.tasks FOR DELETE TO authenticated
    USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- task_assignees: gated through parent task's workspace
CREATE POLICY "Service role full access on task_assignees"
    ON public.task_assignees FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Users view task_assignees in their workspaces"
    ON public.task_assignees FOR SELECT TO authenticated
    USING (task_id IN (SELECT id FROM public.tasks WHERE workspace_id IN (SELECT get_my_workspace_ids())));

CREATE POLICY "Users modify task_assignees in their workspaces"
    ON public.task_assignees FOR INSERT TO authenticated
    WITH CHECK (task_id IN (SELECT id FROM public.tasks WHERE workspace_id IN (SELECT get_my_workspace_ids())));

CREATE POLICY "Users delete task_assignees in their workspaces"
    ON public.task_assignees FOR DELETE TO authenticated
    USING (task_id IN (SELECT id FROM public.tasks WHERE workspace_id IN (SELECT get_my_workspace_ids())));

-- task_events: read-only for users; service role / app inserts via triggers or backend
CREATE POLICY "Service role full access on task_events"
    ON public.task_events FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Users view task_events in their workspaces"
    ON public.task_events FOR SELECT TO authenticated
    USING (task_id IN (SELECT id FROM public.tasks WHERE workspace_id IN (SELECT get_my_workspace_ids())));

CREATE POLICY "Users insert task_events in their workspaces"
    ON public.task_events FOR INSERT TO authenticated
    WITH CHECK (task_id IN (SELECT id FROM public.tasks WHERE workspace_id IN (SELECT get_my_workspace_ids())));
