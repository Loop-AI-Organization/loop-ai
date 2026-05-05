# Sprint 1 Private Chats & Context Awareness - Design Spec

**Date:** 2026-05-05
**Status:** Approved for implementation planning
**Project:** LoopAI
**Sprint Objective:** Private Chats & Context Awareness
**Sprint Duration:** 2 weeks
**Sprint Completion Date:** 2026-04-13
**Developed by:** Arav Adhikari, Adithya Pradeep, Ashwin Murthy, Krishna Kasturi, Raeed Saad

## Goal

Finish Sprint 1 by completing private 1:1 direct messages, persisted LLM participation controls, automatic chat summaries, and AI navigation between conversations.

The implementation should build on the existing LoopAI architecture:

- Frontend: React, TypeScript, Vite, Tailwind, Zustand, Supabase client.
- Backend: FastAPI, Supabase service role client, Redis/RQ worker.
- Database: Supabase Postgres migrations under `/supabase`.
- AI: OpenRouter-backed orchestrator functions in `backend/loop_ai/orchestrator/orchestrator.py`.

Supabase migrations must be created under `/supabase` and applied against the `115b/loopai` Supabase project.

## Current Repo State

Several Sprint 1 foundations already exist:

- `channels.type` supports `project` and `dm`.
- `channel_members` stores DM participants.
- The frontend has New DM flows in `ChannelList` and `CommandPalette`.
- `channels.summary` and `channels.summary_updated_at` exist.
- The worker has channel summary generation.
- The orchestrator has navigation intent detection and channel matching.
- `/api/channels/{channel_id}/triage` already routes navigation, file, task, and normal AI responses.

The remaining work should harden and complete these pieces instead of replacing the conversation model.

## Decisions

- Use the existing `channels` table as the conversation record.
- Use `channels.type = 'dm'` plus `channel_members` for 1:1 private chats.
- Add persisted channel-level LLM settings.
- Treat restricted-LLM as "AI does not actively participate in this chat."
- Restricted chats still generate summaries so AI navigation can use them, matching the sprint document.
- Enforce LLM restrictions in the backend, with frontend checks as a UX optimization.
- Keep summary generation best-effort and non-blocking.

## Data Model

### Channels

Add channel settings in a new migration:

| Column | Type | Default | Notes |
| --- | --- | --- | --- |
| `is_llm_restricted` | boolean | `false` | If true, `/triage` must not generate an AI reply for this channel. |
| `llm_participation_enabled` | boolean | `true` | General per-channel AI participation toggle. |
| `dm_pair_key` | text | `null` | Stable key for 1:1 DMs, set only for `dm` channels. |

Both settings should be selected wherever frontend channel rows are mapped into the `Channel` type.

If both settings are present, restricted mode takes precedence:

- `is_llm_restricted = true`: no AI replies, regardless of `llm_participation_enabled`.
- `llm_participation_enabled = false`: no AI replies, but not necessarily labeled as restricted.
- Summary generation remains allowed for both states.

### Direct Messages

The existing `channel_members` table remains the membership boundary for DMs. The implementation should prevent duplicate 1:1 DMs for the same pair in a workspace.

Use a stable `dm_pair_key` to enforce uniqueness:

- Compute it as the two participant user IDs sorted lexicographically and joined with `:`.
- Add a partial unique index on `(workspace_id, dm_pair_key)` where `type = 'dm'` and `dm_pair_key IS NOT NULL`.
- Backfill existing 1:1 DMs where both participants can be determined.
- Keep existing non-1:1 or malformed DM rows unchanged; they will not receive a pair key.

Backend behavior:

- Add a backend endpoint to create or return a DM.
- Verify both users are workspace members.
- Compute `dm_pair_key`.
- Search existing DM channels by `(workspace_id, dm_pair_key)`.
- If found, return it.
- If not found, create a `dm` channel with `dm_pair_key` and insert both `channel_members`.
- If concurrent creation hits the unique index, re-query and return the existing DM.

## Backend Flow

### DM Creation

Add `POST /api/workspaces/{workspace_id}/dms`.

Request:

```json
{ "other_user_id": "..." }
```

Response:

```json
{
  "id": "...",
  "workspace_id": "...",
  "name": "DM",
  "type": "dm",
  "is_llm_restricted": false,
  "llm_participation_enabled": true
}
```

Behavior:

- Require authentication.
- Confirm caller belongs to the workspace.
- Confirm recipient belongs to the workspace.
- Reject self-DMs with `400`.
- Return the existing 1:1 DM when present.
- Otherwise create the channel and membership rows.

### LLM Participation Enforcement

At the start of `/api/channels/{channel_id}/triage`, load the channel settings before any LLM calls.

If `is_llm_restricted` is true or `llm_participation_enabled` is false:

```json
{
  "should_respond": false,
  "reason": "LLM participation is disabled for this channel"
}
```

This check must happen before navigation detection, file intent detection, task intent detection, or normal response generation. If the backend cannot read channel settings, it should fail closed and avoid generating a response.

### Summary Generation

Summary generation should continue for restricted and participation-disabled channels. This sprint's restricted-LLM requirement prevents active AI participation, not context summarization.

Summary updates should be triggered by conversation activity, including user messages that do not receive AI replies. Existing worker failures should not block chat. On failure, keep the previous summary and log the error.

### Navigation

Keep the existing navigation flow:

1. Detect whether the prompt is asking to move to another channel.
2. Load visible channels and their summaries.
3. Ask the model to choose the best match.
4. Return a navigation payload to the frontend.

Missing summaries should fall back to workspace and channel names. DM channels may use their stored `name` for now; a later sprint can improve display names to show participant names.

## Frontend Flow

### Channel Type Mapping

Extend `Channel` with:

```ts
isLlmRestricted: boolean;
llmParticipationEnabled: boolean;
```

Update `toChannel`, channel fetches, and channel update functions to include the new fields.

### DM UI

Keep existing New DM entry points:

- Sidebar Direct Messages section.
- Command palette Start Direct Message section.

Replace direct Supabase DM creation with the backend endpoint. The store merge behavior can remain the same.

### Inspector Settings

Add channel-specific controls in the Inspector settings tab:

- LLM participation switch.
- Restricted-LLM switch.

The UI should persist changes to Supabase/backend and update the local channel store. Restricted mode takes precedence over the participation switch; when restricted is enabled, the UI should make clear that AI responses are disabled even if the participation switch was previously on.

### Composer Behavior

The composer should inspect the current channel settings.

If AI participation is disabled or restricted:

- Do not show the "AI will respond" hint.
- Do not call `/triage`, even if the message contains `@ai`.
- Still save the user's message normally.

The backend remains authoritative in case the frontend state is stale.

## Error Handling

- DM creation is idempotent. Existing DMs are returned rather than duplicated.
- Non-members cannot create DMs in a workspace.
- The recipient must be a workspace member.
- Channel setting update failures should leave the local UI unchanged or revert optimistic state.
- Triage fails closed when settings cannot be read.
- Summary worker errors are logged and do not block chat.
- Navigation handles missing summaries without failing the request.

## Testing

Add or update focused tests for:

- DM helper creates or returns a DM through the backend-backed path.
- DM candidate listing excludes the current user.
- Channel row mapping includes LLM settings.
- Composer skips `/triage` when the channel is restricted or participation is disabled.
- `/triage` returns `should_respond: false` before LLM work for restricted/disabled channels.
- Summary generation remains allowed for restricted channels.

Verification commands:

```bash
cd frontend
npm run test
npm run build
```

Backend verification should include at least a smoke check for the restricted-channel `/triage` path. If a full backend test harness is not available, document the manual API check used.

## Definition Of Done

Sprint 1 is complete when:

- Users can initiate and maintain 1:1 DMs.
- DM visibility is limited to the two participants plus permitted service-role backend work.
- Restricted-LLM mode prevents AI replies in selected channels.
- Users can toggle LLM participation per channel.
- Channel summaries are generated and stored automatically.
- Navigation can route prompts to the intended chat using channel summaries.
- The demo can show a prompt like "What did we discuss in the marketing chat?" navigating to the relevant conversation.

## Out Of Scope

- Full end-to-end privacy mode that blocks summaries and AI navigation context.
- Group private channels.
- Rich DM display names based on participant profiles.
- Vector embeddings for semantic channel search.
- Replacing the current thread compatibility layer.
