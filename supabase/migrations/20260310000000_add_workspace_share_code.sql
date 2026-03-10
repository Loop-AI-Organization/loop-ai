-- Add share_code to workspaces for invite-by-code

ALTER TABLE public.workspaces
    ADD COLUMN IF NOT EXISTS share_code text;

-- Ensure share_code values are unique when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_share_code
    ON public.workspaces(share_code);

-- Backfill existing workspaces with a random 8-character code (uppercase hex)
UPDATE public.workspaces
SET share_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE share_code IS NULL;

