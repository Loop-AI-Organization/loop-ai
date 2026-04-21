-- Add user_id to threads (matches remote DB state).
-- Nullable: threads created before this column was added have no user.

ALTER TABLE public.threads
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_threads_user_id ON public.threads(user_id);
