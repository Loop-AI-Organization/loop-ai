# Sprint 1 Private Chats & Context Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Sprint 1 by hardening 1:1 DMs, adding persisted LLM participation controls, enforcing restricted-channel triage behavior, and keeping channel summaries fresh for AI navigation.

**Architecture:** Keep the existing `channels` model. Add channel settings and a `dm_pair_key` to Supabase, move DM creation behind the FastAPI backend for membership and uniqueness enforcement, map the new settings through the React data layer, and make both frontend and backend skip AI responses for disabled/restricted channels. Summary generation remains allowed for restricted channels and is refreshed after user messages through a lightweight backend enqueue endpoint.

**Tech Stack:** Supabase Postgres migrations under `/supabase` targeting the `115b/loopai` project, FastAPI, Redis/RQ, React, TypeScript, Vite, Zustand, Vitest, OpenRouter.

---

### Task 1: Supabase Migration For Channel LLM Settings And DM Pair Keys

**Files:**
- Create: `supabase/migrations/20260505090000_channel_llm_settings_dm_pair_key.sql`
- Modify: `supabase/setup_tables_manual.sql`

- [ ] **Step 1: Create the failing migration-review command**

Run:

```bash
test -f supabase/migrations/20260505090000_channel_llm_settings_dm_pair_key.sql
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 2: Add the migration**

Create `supabase/migrations/20260505090000_channel_llm_settings_dm_pair_key.sql` with:

```sql
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
```

- [ ] **Step 3: Update manual setup schema**

In `supabase/setup_tables_manual.sql`, update the `public.channels` table definition so it includes these columns:

```sql
    is_llm_restricted boolean NOT NULL DEFAULT false,
    llm_participation_enabled boolean NOT NULL DEFAULT true,
    dm_pair_key text,
```

Also add this partial unique index near the existing channel indexes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_workspace_dm_pair_key
    ON public.channels(workspace_id, dm_pair_key)
    WHERE type = 'dm' AND dm_pair_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channels_llm_participation ON public.channels(llm_participation_enabled);
CREATE INDEX IF NOT EXISTS idx_channels_llm_restricted ON public.channels(is_llm_restricted);
```

- [ ] **Step 4: Verify migration syntax locally**

Run:

```bash
rg -n "is_llm_restricted|llm_participation_enabled|dm_pair_key|idx_channels_workspace_dm_pair_key" supabase/migrations/20260505090000_channel_llm_settings_dm_pair_key.sql supabase/setup_tables_manual.sql
```

Expected: all four identifiers appear in both files.

- [ ] **Step 5: Apply migration to Supabase**

From the repository root, use the Supabase project under `/supabase` and select the `115b/loopai` project:

```bash
cd supabase
npx supabase db push
```

Expected: the migration applies successfully to `115b/loopai`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260505090000_channel_llm_settings_dm_pair_key.sql supabase/setup_tables_manual.sql
git commit -m "feat: add channel llm settings and dm pair keys"
```

---

### Task 2: Backend DM Endpoint And Channel Settings API

**Files:**
- Modify: `backend/app/routes.py`

- [ ] **Step 1: Add request and response models**

In `backend/app/routes.py`, near the other Pydantic models, add:

```python
class CreateDmRequest(BaseModel):
    other_user_id: str


class ChannelSettingsRequest(BaseModel):
    is_llm_restricted: Optional[bool] = None
    llm_participation_enabled: Optional[bool] = None
```

- [ ] **Step 2: Add shared channel helpers**

In `backend/app/routes.py`, after `_create_unique_share_code`, add:

```python
def _user_can_access_workspace(workspace_id: str, user_id: str) -> bool:
    ws = (
        supabase.table("workspaces")
        .select("id, user_id")
        .eq("id", workspace_id)
        .limit(1)
        .execute()
    )
    if ws.data and ws.data[0].get("user_id") == user_id:
        return True
    member = (
        supabase.table("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return bool(member.data)


def _dm_pair_key(user_a: str, user_b: str) -> str:
    return ":".join(sorted([user_a, user_b]))


def _select_channel_by_id(channel_id: str) -> Optional[dict]:
    res = (
        supabase.table("channels")
        .select("id, workspace_id, name, type, created_at, summary, summary_updated_at, is_llm_restricted, llm_participation_enabled, dm_pair_key")
        .eq("id", channel_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None
```

- [ ] **Step 3: Add backend DM creation endpoint**

In `backend/app/routes.py`, after `get_workspace_members_with_profiles`, add:

```python
@router.post("/api/workspaces/{workspace_id}/dms")
async def create_or_get_dm(
    workspace_id: str,
    body: CreateDmRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    other_user_id = (body.other_user_id or "").strip()
    if not other_user_id:
        raise HTTPException(status_code=400, detail="other_user_id required")
    if other_user_id == uid:
        raise HTTPException(status_code=400, detail="Cannot create a DM with yourself")

    if not _user_can_access_workspace(workspace_id, uid):
        raise HTTPException(status_code=403, detail="Not a member of this workspace")
    if not _user_can_access_workspace(workspace_id, other_user_id):
        raise HTTPException(status_code=403, detail="Recipient is not a member of this workspace")

    pair_key = _dm_pair_key(uid, other_user_id)
    existing = (
        supabase.table("channels")
        .select("id, workspace_id, name, type, created_at, summary, summary_updated_at, is_llm_restricted, llm_participation_enabled, dm_pair_key")
        .eq("workspace_id", workspace_id)
        .eq("type", "dm")
        .eq("dm_pair_key", pair_key)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    try:
        created = (
            supabase.table("channels")
            .insert(
                {
                    "workspace_id": workspace_id,
                    "name": "DM",
                    "type": "dm",
                    "dm_pair_key": pair_key,
                    "is_llm_restricted": False,
                    "llm_participation_enabled": True,
                }
            )
            .select("id, workspace_id, name, type, created_at, summary, summary_updated_at, is_llm_restricted, llm_participation_enabled, dm_pair_key")
            .single()
            .execute()
        )
        if not created.data:
            raise HTTPException(status_code=500, detail="Failed to create DM")
        channel = created.data
        supabase.table("channel_members").insert(
            [
                {"channel_id": channel["id"], "user_id": uid},
                {"channel_id": channel["id"], "user_id": other_user_id},
            ]
        ).execute()
        return channel
    except HTTPException:
        raise
    except Exception:
        # A concurrent request may have inserted the same pair key first.
        retry = (
            supabase.table("channels")
            .select("id, workspace_id, name, type, created_at, summary, summary_updated_at, is_llm_restricted, llm_participation_enabled, dm_pair_key")
            .eq("workspace_id", workspace_id)
            .eq("type", "dm")
            .eq("dm_pair_key", pair_key)
            .limit(1)
            .execute()
        )
        if retry.data:
            return retry.data[0]
        raise HTTPException(status_code=500, detail="Failed to create DM")
```

- [ ] **Step 4: Add channel settings endpoint**

In `backend/app/routes.py`, near the channel/triage routes, add:

```python
@router.patch("/api/channels/{channel_id}/settings")
async def update_channel_settings(
    channel_id: str,
    body: ChannelSettingsRequest,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    channel = _select_channel_by_id(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if not _user_can_access_workspace(channel["workspace_id"], uid):
        raise HTTPException(status_code=403, detail="Not a member of this workspace")

    updates: dict[str, bool] = {}
    if body.is_llm_restricted is not None:
        updates["is_llm_restricted"] = body.is_llm_restricted
    if body.llm_participation_enabled is not None:
        updates["llm_participation_enabled"] = body.llm_participation_enabled

    if not updates:
        return channel

    result = (
        supabase.table("channels")
        .update(updates)
        .eq("id", channel_id)
        .select("id, workspace_id, name, type, created_at, summary, summary_updated_at, is_llm_restricted, llm_participation_enabled, dm_pair_key")
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update channel settings")
    return result.data
```

- [ ] **Step 5: Add summary enqueue endpoint**

In `backend/app/routes.py`, after `update_channel_settings`, add:

```python
@router.post("/api/channels/{channel_id}/summary/refresh")
async def enqueue_channel_summary_refresh(
    channel_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    channel = _select_channel_by_id(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if not _user_can_access_workspace(channel["workspace_id"], uid):
        raise HTTPException(status_code=403, detail="Not a member of this workspace")

    try:
        enqueue_action(channel_id, "generate_summary", action_id=None)
    except Exception as exc:
        logger.warning("summary enqueue failed channel_id=%s error=%s", channel_id, exc)
        return {"ok": False, "queued": False}

    return {"ok": True, "queued": True}
```

- [ ] **Step 6: Run backend import check**

Run:

```bash
cd backend
python -m compileall app loop_ai
```

Expected: command exits `0`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routes.py
git commit -m "feat: add dm and channel settings api"
```

---

### Task 3: Frontend Channel Types, Data Mapping, And DM Helper

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/supabase-data.ts`
- Modify: `frontend/src/lib/dm.ts`
- Modify: `frontend/src/lib/dm.test.ts`

- [ ] **Step 1: Write failing frontend tests for DM backend usage**

Replace or extend `frontend/src/lib/dm.test.ts` with tests that verify `launchDirectMessage` calls the backend-backed `createDmChannel` and keeps candidate filtering:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { launchDirectMessage, listDmCandidates } from '@/lib/dm';
import { useAppStore } from '@/store/app-store';
import * as data from '@/lib/supabase-data';

vi.mock('@/lib/supabase-data', async () => {
  return {
    createDmChannel: vi.fn(),
    fetchWorkspaceMemberProfiles: vi.fn(),
  };
});

describe('dm helpers', () => {
  beforeEach(() => {
    useAppStore.setState({
      user: { id: 'user-1', name: 'Ashwin', email: 'a@example.com', status: 'online' },
      channels: [],
    });
    vi.resetAllMocks();
  });

  it('launches a direct message through the data layer and caches it', async () => {
    vi.mocked(data.createDmChannel).mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
      name: 'DM',
      type: 'dm',
      unreadCount: 0,
      isLlmRestricted: false,
      llmParticipationEnabled: true,
    });

    const channel = await launchDirectMessage('ws-1', 'user-2');

    expect(data.createDmChannel).toHaveBeenCalledWith('ws-1', 'user-2');
    expect(channel.id).toBe('dm-1');
    expect(useAppStore.getState().channels[0]?.id).toBe('dm-1');
  });

  it('does not duplicate a cached channel when launching an existing DM', async () => {
    useAppStore.setState({
      channels: [{
        id: 'dm-1',
        workspaceId: 'ws-1',
        name: 'DM',
        type: 'dm',
        unreadCount: 0,
        isLlmRestricted: false,
        llmParticipationEnabled: true,
      }],
    });
    vi.mocked(data.createDmChannel).mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
      name: 'DM',
      type: 'dm',
      unreadCount: 0,
      isLlmRestricted: false,
      llmParticipationEnabled: true,
    });

    await launchDirectMessage('ws-1', 'user-2');

    expect(useAppStore.getState().channels).toHaveLength(1);
  });

  it('filters current user out of DM candidates', async () => {
    vi.mocked(data.fetchWorkspaceMemberProfiles).mockResolvedValue([
      { id: 'wm-1', userId: 'user-1', role: 'owner', email: 'a@example.com', displayName: 'Ashwin' },
      { id: 'wm-2', userId: 'user-2', role: 'member', email: 'b@example.com', displayName: 'Bob' },
    ]);

    const members = await listDmCandidates('ws-1');

    expect(members.map((m) => m.userId)).toEqual(['user-2']);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd frontend
npm run test -- src/lib/dm.test.ts
```

Expected: FAIL because `Channel` does not yet include LLM settings and `createDmChannel` still uses direct Supabase creation.

- [ ] **Step 3: Extend the Channel type**

In `frontend/src/types/index.ts`, update `Channel`:

```ts
export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  type: 'project' | 'dm';
  unreadCount: number;
  lastMessage?: string;
  avatar?: string;
  isLlmRestricted: boolean;
  llmParticipationEnabled: boolean;
}
```

- [ ] **Step 4: Update channel row mapping and selects**

In `frontend/src/lib/supabase-data.ts`, update `ChannelRow`:

```ts
interface ChannelRow {
  id: string;
  workspace_id: string;
  name: string;
  type: 'project' | 'dm';
  created_at: string;
  is_llm_restricted?: boolean | null;
  llm_participation_enabled?: boolean | null;
}
```

Update `toChannel`:

```ts
function toChannel(r: ChannelRow): Channel {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    type: r.type,
    unreadCount: 0,
    lastMessage: undefined,
    isLlmRestricted: r.is_llm_restricted === true,
    llmParticipationEnabled: r.llm_participation_enabled !== false,
  };
}
```

Replace channel select strings in `fetchChannels`, `findExistingDm`, `createChannel`, `updateChannel`, and other channel reads with:

```ts
'id, workspace_id, name, type, created_at, is_llm_restricted, llm_participation_enabled'
```

- [ ] **Step 5: Replace direct DM creation with backend endpoint**

In `frontend/src/lib/supabase-data.ts`, replace `createDmChannel` with:

```ts
export async function createDmChannel(workspaceId: string, otherUserId: string): Promise<Channel> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/dms`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ other_user_id: otherUserId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Failed to start direct message (${res.status})`);
  }
  return toChannel(body as ChannelRow);
}
```

- [ ] **Step 6: Add channel settings update helper**

In `frontend/src/lib/supabase-data.ts`, add:

```ts
export async function updateChannelSettings(
  channelId: string,
  settings: { isLlmRestricted?: boolean; llmParticipationEnabled?: boolean }
): Promise<Channel> {
  const headers = await getAuthHeaders();
  const payload: Record<string, boolean> = {};
  if (settings.isLlmRestricted !== undefined) {
    payload.is_llm_restricted = settings.isLlmRestricted;
  }
  if (settings.llmParticipationEnabled !== undefined) {
    payload.llm_participation_enabled = settings.llmParticipationEnabled;
  }
  const res = await fetch(`${API_URL}/api/channels/${channelId}/settings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Failed to update channel settings (${res.status})`);
  }
  return toChannel(body as ChannelRow);
}
```

- [ ] **Step 7: Add summary refresh helper**

In `frontend/src/lib/supabase-data.ts`, add:

```ts
export async function refreshChannelSummary(channelId: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${API_URL}/api/channels/${channelId}/summary/refresh`, {
    method: 'POST',
    headers,
  });
}
```

- [ ] **Step 8: Run frontend tests**

Run:

```bash
cd frontend
npm run test -- src/lib/dm.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/supabase-data.ts frontend/src/lib/dm.ts frontend/src/lib/dm.test.ts
git commit -m "feat: map channel llm settings and backend dm creation"
```

---

### Task 4: Backend Triage Enforcement And Summary Refresh On User Messages

**Files:**
- Modify: `backend/app/routes.py`
- Modify: `frontend/src/lib/supabase-data.ts`

- [ ] **Step 1: Add backend triage guard**

In `backend/app/routes.py`, inside `respond_to_ai_mention`, immediately after resolving `thread_id`, add:

```python
    channel = _select_channel_by_id(channel_id)
    if not channel:
        return {
            "should_respond": False,
            "reason": "Channel settings unavailable",
        }
    if channel.get("is_llm_restricted") is True or channel.get("llm_participation_enabled") is False:
        return {
            "should_respond": False,
            "reason": "LLM participation is disabled for this channel",
        }
```

This must run before `detect_navigation_intent`, `detect_file_intent`, `detect_task_intent`, or `generate_full_response`.

- [ ] **Step 2: Add best-effort summary enqueue after user message insert**

In `frontend/src/lib/supabase-data.ts`, update `insertMessage` so after the Supabase insert succeeds, it queues a summary refresh for user messages:

```ts
  const message = toMessage(data as MessageRow);
  if (role === 'user') {
    void refreshChannelSummary(channelId).catch(() => {});
  }
  return message;
```

Replace the existing final `return toMessage(data as MessageRow);` in `insertMessage`.

- [ ] **Step 3: Verify triage guard ordering**

Run:

```bash
rg -n "LLM participation is disabled|detect_navigation_intent|detect_file_intent|detect_task_intent|generate_full_response" backend/app/routes.py
```

Expected: the disabled-participation guard appears before all LLM detector calls inside `respond_to_ai_mention`.

- [ ] **Step 4: Run backend import check**

Run:

```bash
cd backend
python -m compileall app loop_ai
```

Expected: command exits `0`.

- [ ] **Step 5: Run frontend type check**

Run:

```bash
cd frontend
npm run build
```

Expected: build exits `0`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routes.py frontend/src/lib/supabase-data.ts
git commit -m "feat: enforce channel llm settings in triage"
```

---

### Task 5: Inspector Settings UI For Restricted-LLM And Participation Toggle

**Files:**
- Modify: `frontend/src/components/inspector-panel.tsx`

- [ ] **Step 1: Add imports**

In `frontend/src/components/inspector-panel.tsx`, add `BotOff` to the lucide import and add `updateChannelSettings` to the data import:

```ts
import { X, Clock, Settings2, Brain, File, ListChecks, BotOff } from 'lucide-react';
import { fetchWorkspaceFiles, fetchChannelTasks, updateChannelSettings } from '@/lib/supabase-data';
```

- [ ] **Step 2: Add local save state**

Inside `InspectorPanel`, after `workspaceFiles` state, add:

```ts
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
```

Also derive the current channel:

```ts
  const currentChannel = useAppStore((s) =>
    s.channels.find((c) => c.id === s.currentChannelId)
  );
```

- [ ] **Step 3: Add settings save handler**

Inside `InspectorPanel`, before the `if (!isInspectorOpen) return null;` line, add:

```ts
  const saveChannelSettings = async (settings: {
    isLlmRestricted?: boolean;
    llmParticipationEnabled?: boolean;
  }) => {
    if (!currentChannelId || settingsSaving) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const updated = await updateChannelSettings(currentChannelId, settings);
      useAppStore.setState((state) => ({
        channels: state.channels.map((channel) =>
          channel.id === currentChannelId ? { ...channel, ...updated } : channel
        ),
      }));
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : 'Failed to save channel settings');
    } finally {
      setSettingsSaving(false);
    }
  };
```

- [ ] **Step 4: Replace settings tab switches**

In the settings tab, replace the existing `mentionOnlyMode` and `respondOnlyIfUnanswered` switch block with:

```tsx
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm">LLM participation</Label>
                      <p className="text-2xs text-muted-foreground">
                        Allow @ai responses in this channel
                      </p>
                    </div>
                    <Switch
                      checked={currentChannel?.llmParticipationEnabled !== false}
                      disabled={settingsSaving || currentChannel?.isLlmRestricted === true}
                      onCheckedChange={(checked) =>
                        void saveChannelSettings({ llmParticipationEnabled: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm flex items-center gap-1.5">
                        <BotOff className="w-3.5 h-3.5" />
                        Restricted-LLM
                      </Label>
                      <p className="text-2xs text-muted-foreground">
                        Prevent active AI replies while keeping summaries available
                      </p>
                    </div>
                    <Switch
                      checked={currentChannel?.isLlmRestricted === true}
                      disabled={settingsSaving}
                      onCheckedChange={(checked) =>
                        void saveChannelSettings({ isLlmRestricted: checked })
                      }
                    />
                  </div>

                  {currentChannel?.isLlmRestricted ? (
                    <p className="text-xs text-muted-foreground">
                      AI responses are disabled in this channel. Conversation summaries can still update for navigation.
                    </p>
                  ) : null}

                  {settingsError ? (
                    <p className="text-sm text-destructive">{settingsError}</p>
                  ) : null}
                </div>
```

- [ ] **Step 5: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: build exits `0`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/inspector-panel.tsx
git commit -m "feat: add channel llm settings controls"
```

---

### Task 6: Composer Bypass For Restricted Or Disabled Channels

**Files:**
- Modify: `frontend/src/components/composer.tsx`
- Create: `frontend/src/components/composer.test.tsx`

- [ ] **Step 1: Write failing composer bypass tests**

Create `frontend/src/components/composer.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '@/components/composer';
import { useAppStore } from '@/store/app-store';
import * as data from '@/lib/supabase-data';

vi.mock('@/lib/supabase-data', async () => {
  return {
    insertMessage: vi.fn(),
    triageAndRespond: vi.fn(),
    uploadFile: vi.fn(),
  };
});

describe('Composer LLM participation controls', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(data.insertMessage).mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
      role: 'user',
      content: '@ai hello',
      createdAt: new Date(),
      userId: 'user-1',
      userDisplayName: 'Ashwin',
    });
    useAppStore.setState({
      currentWorkspaceId: 'ws-1',
      currentChannelId: 'ch-1',
      channels: [{
        id: 'ch-1',
        workspaceId: 'ws-1',
        name: 'general',
        type: 'project',
        unreadCount: 0,
        isLlmRestricted: false,
        llmParticipationEnabled: true,
      }],
      messages: [],
      orchestratorStatus: 'ready',
    });
  });

  it('does not call triage when the channel is restricted', async () => {
    useAppStore.setState((state) => ({
      channels: state.channels.map((channel) => ({
        ...channel,
        isLlmRestricted: true,
      })),
    }));

    render(<Composer />, { wrapper: MemoryRouter });
    const input = screen.getByPlaceholderText(/Type a message/i);
    fireEvent.change(input, { target: { value: '@ai hello' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(data.insertMessage).toHaveBeenCalled());
    expect(data.triageAndRespond).not.toHaveBeenCalled();
    expect(screen.queryByText(/AI will respond/i)).not.toBeInTheDocument();
  });

  it('does not call triage when LLM participation is disabled', async () => {
    useAppStore.setState((state) => ({
      channels: state.channels.map((channel) => ({
        ...channel,
        llmParticipationEnabled: false,
      })),
    }));

    render(<Composer />, { wrapper: MemoryRouter });
    const input = screen.getByPlaceholderText(/Type a message/i);
    fireEvent.change(input, { target: { value: '@ai hello' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(data.insertMessage).toHaveBeenCalled());
    expect(data.triageAndRespond).not.toHaveBeenCalled();
    expect(screen.getByText(/AI responses disabled in this channel/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the failing composer test**

Run:

```bash
cd frontend
npm run test -- src/components/composer.test.tsx
```

Expected: FAIL because `Composer` does not yet read channel LLM settings.

- [ ] **Step 3: Add current channel selector**

In `frontend/src/components/composer.tsx`, include `channels` in the store destructuring and derive the current channel:

```ts
  const {
    currentWorkspaceId,
    currentChannelId,
    channels,
    orchestratorStatus,
    addMessage,
    setOrchestratorStatus,
  } = useAppStore();

  const currentChannel = channels.find((channel) => channel.id === currentChannelId);
  const aiResponsesDisabled =
    currentChannel?.isLlmRestricted === true ||
    currentChannel?.llmParticipationEnabled === false;
```

- [ ] **Step 4: Bypass triage after saving user messages**

In `handleSubmit`, replace:

```ts
    if (!mentionsAi) {
      return;
    }
```

with:

```ts
    if (!mentionsAi || aiResponsesDisabled) {
      return;
    }
```

- [ ] **Step 5: Update AI hint and footer text**

Replace:

```ts
  const showsAiHint = hasAiMention(value);
```

with:

```ts
  const showsAiHint = hasAiMention(value) && !aiResponsesDisabled;
```

In the footer hint, replace the static text with:

```tsx
            <span>
              {aiResponsesDisabled ? 'AI responses disabled in this channel' : 'type '}
              {!aiResponsesDisabled ? <strong>@ai</strong> : null}
              {!aiResponsesDisabled ? ' to get AI response' : null}
            </span>
```

- [ ] **Step 6: Run composer test**

Run:

```bash
cd frontend
npm run test -- src/components/composer.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: build exits `0`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/composer.tsx frontend/src/components/composer.test.tsx
git commit -m "feat: skip ai triage when channel disables llm"
```

---

### Task 7: Navigation And Summary Verification

**Files:**
- Modify: `backend/app/routes.py`

- [ ] **Step 1: Verify navigation includes settings without using them as filters**

In `_get_user_channels` in `backend/app/routes.py`, update the channel select to include LLM settings for observability, but do not filter restricted channels out:

```python
        .select("id, workspace_id, name, type, summary, is_llm_restricted, llm_participation_enabled")
```

In the result dict, add:

```python
            "is_llm_restricted": ch.get("is_llm_restricted", False),
            "llm_participation_enabled": ch.get("llm_participation_enabled", True),
```

- [ ] **Step 2: Keep worker summary generation unrestricted**

Run:

```bash
rg -n "if .*is_llm_restricted|if .*llm_participation_enabled|return .*is_llm_restricted|return .*llm_participation_enabled" backend/worker.py
```

Expected: no output. `_generate_channel_summary` must not skip restricted or participation-disabled channels because the sprint docs require summaries to continue.

- [ ] **Step 3: Run verification search**

Run:

```bash
rg -n "is_llm_restricted|llm_participation_enabled" backend/app/routes.py backend/worker.py
```

Expected: backend routes show settings in channel selection, settings update, and triage enforcement. Worker must not contain a conditional that skips summaries for restricted channels.

- [ ] **Step 4: Run backend import check**

Run:

```bash
cd backend
python -m compileall app loop_ai
```

Expected: command exits `0`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes.py
git commit -m "feat: expose llm settings in navigation context"
```

---

### Task 8: Final Verification

**Files:**
- No planned code changes.

- [ ] **Step 1: Check working tree**

Run:

```bash
git status --short
```

Expected: no uncommitted changes before final verification.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
cd frontend
npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: build exits `0`.

- [ ] **Step 4: Run backend compile check**

Run:

```bash
cd backend
python -m compileall app loop_ai
```

Expected: command exits `0`.

- [ ] **Step 5: Manual smoke test**

With the backend and frontend running:

```bash
cd backend
uvicorn app.main:app --reload --port 4000
```

```bash
cd frontend
npm run dev
```

In the app:

1. Open a workspace with at least two members.
2. Start a DM from the sidebar or command palette.
3. Send a normal DM message and confirm only the DM channel receives it.
4. In Inspector settings, enable Restricted-LLM.
5. Send `@ai hello` and confirm no assistant reply appears.
6. Disable Restricted-LLM and disable LLM participation.
7. Send `@ai hello` and confirm no assistant reply appears.
8. Re-enable LLM participation.
9. Send a navigation request from a normal channel and confirm navigation still uses summarized channels.

- [ ] **Step 6: Final commit if verification changes were needed**

If the verification steps required small fixes, commit them:

```bash
git status --short
git add path/to/changed-file
git commit -m "fix: complete sprint 1 verification fixes"
```

If there were no changes, do not create an empty commit.
