-- Fix: foreign keys referencing workspaces are missing ON DELETE CASCADE.
-- Drop and re-add them with CASCADE so deleting a workspace cleans up
-- workspace_members, channels, threads, etc.

-- workspace_members → workspaces
ALTER TABLE public.workspace_members
    DROP CONSTRAINT IF EXISTS workspace_members_workspace_id_fkey;
ALTER TABLE public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- channels → workspaces
ALTER TABLE public.channels
    DROP CONSTRAINT IF EXISTS channels_workspace_id_fkey;
ALTER TABLE public.channels
    ADD CONSTRAINT channels_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- threads → workspaces
ALTER TABLE public.threads
    DROP CONSTRAINT IF EXISTS threads_workspace_id_fkey;
ALTER TABLE public.threads
    ADD CONSTRAINT threads_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
