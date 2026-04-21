-- Migrate existing thread_files data into files, then drop thread_files.

-- 1. Create files table
CREATE TABLE IF NOT EXISTS public.files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'generated')),
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL DEFAULT 0,
    content_type text,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    summary text,
    project_context text,
    tags text[],
    metadata_status text NOT NULL DEFAULT 'pending' CHECK (metadata_status IN ('pending', 'ready', 'failed')),
    source_channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_files_workspace_id ON public.files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_files_created_by ON public.files(created_by);
CREATE INDEX IF NOT EXISTS idx_files_source_channel_id ON public.files(source_channel_id);
CREATE INDEX IF NOT EXISTS idx_files_tags ON public.files USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_files_metadata_status ON public.files(metadata_status);

-- 3. RLS
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on files"
    ON public.files FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can view files in their workspaces"
    ON public.files FOR SELECT
    TO authenticated
    USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY "Users can create files in their workspaces"
    ON public.files FOR INSERT
    TO authenticated
    WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY "Users can update own files"
    ON public.files FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete own files"
    ON public.files FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

-- 4. Migrate existing thread_files data
INSERT INTO public.files (id, workspace_id, source, storage_path, file_name, file_size, content_type, created_by, created_at, metadata_status, source_channel_id)
SELECT
    tf.id,
    t.workspace_id,
    'upload',
    tf.storage_path,
    tf.file_name,
    tf.file_size,
    tf.content_type,
    tf.uploaded_by,
    tf.created_at,
    'pending',
    t.channel_id
FROM public.thread_files tf
JOIN public.threads t ON t.id = tf.thread_id
WHERE t.workspace_id IS NOT NULL;

-- 5. Drop thread_files
DROP TABLE IF EXISTS public.thread_files;
