-- thread_files: file metadata for files attached to a thread (for LLM context and inspector)
CREATE TABLE IF NOT EXISTS public.thread_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL DEFAULT 0,
    content_type text,
    uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_files_thread_id ON public.thread_files(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_files_uploaded_by ON public.thread_files(uploaded_by);

-- RLS: same access as messages (users can read/insert/delete for threads they can access)
ALTER TABLE public.thread_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access thread_files in visible threads"
    ON public.thread_files FOR ALL
    TO authenticated
    USING (
        thread_id IN (
            SELECT t.id FROM public.threads t
            WHERE t.workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
            OR t.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
            OR t.channel_id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid())
        )
    )
    WITH CHECK (
        thread_id IN (
            SELECT t.id FROM public.threads t
            WHERE t.workspace_id IN (SELECT id FROM public.workspaces WHERE user_id = auth.uid())
            OR t.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
            OR t.channel_id IN (SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid())
        )
    );
