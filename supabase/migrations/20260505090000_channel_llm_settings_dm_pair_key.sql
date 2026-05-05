-- Sprint 1: channel-level LLM controls and stable 1:1 DM uniqueness.

ALTER TABLE public.channels
    ADD COLUMN IF NOT EXISTS is_llm_restricted boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS llm_participation_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS dm_pair_key text;

-- Backfill pair keys for existing valid 1:1 DMs. DMs with fewer or more than
-- two members are left untouched so the migration is non-destructive.
WITH dm_pairs AS (
    SELECT
        c.id AS channel_id,
        string_agg(cm.user_id::text, ':' ORDER BY cm.user_id::text) AS pair_key,
        count(*) AS member_count
    FROM public.channels c
    JOIN public.channel_members cm ON cm.channel_id = c.id
    WHERE c.type = 'dm'
    GROUP BY c.id
)
UPDATE public.channels c
SET dm_pair_key = dm_pairs.pair_key
FROM dm_pairs
WHERE c.id = dm_pairs.channel_id
  AND dm_pairs.member_count = 2
  AND c.dm_pair_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_workspace_dm_pair_key
    ON public.channels(workspace_id, dm_pair_key)
    WHERE type = 'dm' AND dm_pair_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channels_llm_participation
    ON public.channels(llm_participation_enabled);

CREATE INDEX IF NOT EXISTS idx_channels_llm_restricted
    ON public.channels(is_llm_restricted);
