-- Add author metadata to messages for multi-user chat UI.
-- `user_id` and `user_display_name` are nullable to keep assistant/system/tool messages valid.

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS user_display_name text;

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);

