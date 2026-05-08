# Sprint 3 Task Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a direct `Export Tasks` workflow that saves confirmed channel tasks as a generated Markdown checklist file.

**Architecture:** Keep the existing task export engine, but make checklist rendering deterministic so it can be tested without LLM output variance. Add a direct authenticated backend route for UI-triggered exports, then add a compact Inspector Tasks tab button that calls the route and refreshes workspace files.

**Tech Stack:** FastAPI, Supabase Python client, Python `unittest`, React, Zustand, Vitest, existing shadcn-style UI primitives, Lucide icons.

---

## File Structure

- Modify `backend/loop_ai/orchestrator/orchestrator.py`
  - Add `format_task_export_markdown(title, tasks)` as a deterministic formatter.
  - Update `export_tasks_as_document()` to use the formatter instead of an LLM call for checklist content.
- Modify `backend/app/routes.py`
  - Add `POST /api/channels/{channel_id}/tasks/export`.
  - Reuse `_select_channel_by_id()` and `_user_can_access_workspace()`.
- Create `backend/tests/test_task_export_format.py`
  - Unit tests for Markdown grouping, checklist state, metadata, and proposed-task exclusion.
- Create `backend/tests/test_task_export_route.py`
  - Unit tests for route behavior with mocked channel access and export engine.
- Modify `frontend/src/lib/supabase-data.ts`
  - Add `exportChannelTasks(channelId)` helper returning `FileRecord`.
- Create `frontend/src/components/inspector-panel.test.tsx`
  - Tests for disabled state, success refresh, loading state, and error state.
- Modify `frontend/src/components/inspector-panel.tsx`
  - Add export button and feedback in Tasks tab.
  - Refresh workspace files after successful export.

---

### Task 1: Deterministic Markdown Formatter

**Files:**
- Modify: `backend/loop_ai/orchestrator/orchestrator.py`
- Create: `backend/tests/test_task_export_format.py`

- [ ] **Step 1: Write the failing formatter tests**

Create `backend/tests/test_task_export_format.py`:

```python
import unittest

from loop_ai.orchestrator.orchestrator import format_task_export_markdown


class TaskExportMarkdownTest(unittest.TestCase):
    def test_groups_confirmed_tasks_by_status_and_renders_checklists(self):
        content = format_task_export_markdown(
            title="Sprint Tasks",
            tasks=[
                {
                    "title": "Wire export button",
                    "status": "open",
                    "description": "Add the action to the inspector task panel.",
                    "due_date": "2026-07-13T00:00:00Z",
                    "task_assignees": [{"display_name": "Raeed Saad"}],
                },
                {
                    "title": "Verify generated checklist",
                    "status": "done",
                    "description": None,
                    "due_date": None,
                    "task_assignees": [{"display_name": "Ashwin Murthy"}],
                },
                {
                    "title": "Unreviewed AI suggestion",
                    "status": "proposed",
                    "description": "This should not leave the taskboard.",
                    "due_date": None,
                    "task_assignees": [],
                },
            ],
        )

        self.assertIn("# Sprint Tasks", content)
        self.assertIn("## Open", content)
        self.assertIn("- [ ] Wire export button (Assignees: Raeed Saad; Due: 2026-07-13)", content)
        self.assertIn("  - Add the action to the inspector task panel.", content)
        self.assertIn("## Done", content)
        self.assertIn("- [x] Verify generated checklist (Assignees: Ashwin Murthy)", content)
        self.assertNotIn("Unreviewed AI suggestion", content)

    def test_returns_empty_string_when_only_proposed_tasks_exist(self):
        content = format_task_export_markdown(
            title="Task List",
            tasks=[
                {
                    "title": "Maybe do this",
                    "status": "proposed",
                    "description": None,
                    "due_date": None,
                    "task_assignees": [],
                }
            ],
        )

        self.assertEqual(content, "")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run formatter tests to verify they fail**

Run:

```bash
PYTHONPATH=backend python -m unittest backend.tests.test_task_export_format -v
```

Expected: FAIL or import error because `format_task_export_markdown` does not exist yet.

- [ ] **Step 3: Add the deterministic formatter**

In `backend/loop_ai/orchestrator/orchestrator.py`, replace `_TASK_EXPORT_PROMPT` with these helper constants and functions near the current export code:

```python
_TASK_EXPORT_STATUS_ORDER = ["open", "in_progress", "blocked", "done"]
_TASK_EXPORT_STATUS_LABELS = {
    "open": "Open",
    "in_progress": "In Progress",
    "blocked": "Blocked",
    "done": "Done",
}


def _format_task_due_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return str(value)[:10]


def _format_task_assignees(task: Dict) -> List[str]:
    names: List[str] = []
    for assignee in task.get("task_assignees") or []:
        name = (assignee.get("display_name") or "").strip()
        if name:
            names.append(name)
    return names


def format_task_export_markdown(*, title: str, tasks: List[Dict]) -> str:
    confirmed = [
        task for task in tasks
        if task.get("status") in _TASK_EXPORT_STATUS_ORDER
    ]
    if not confirmed:
        return ""

    lines = [f"# {title.strip() or 'Task List'}"]
    for status in _TASK_EXPORT_STATUS_ORDER:
        group = [task for task in confirmed if task.get("status") == status]
        if not group:
            continue
        lines.extend(["", f"## {_TASK_EXPORT_STATUS_LABELS[status]}", ""])
        for task in group:
            checkbox = "x" if status == "done" else " "
            metadata: List[str] = []
            assignees = _format_task_assignees(task)
            if assignees:
                metadata.append(f"Assignees: {', '.join(assignees)}")
            due_date = _format_task_due_date(task.get("due_date"))
            if due_date:
                metadata.append(f"Due: {due_date}")
            suffix = f" ({'; '.join(metadata)})" if metadata else ""
            title_text = str(task.get("title") or "Untitled task").strip() or "Untitled task"
            lines.append(f"- [{checkbox}] {title_text}{suffix}")
            description = (task.get("description") or "").strip()
            if description:
                lines.append(f"  - {description}")

    return "\n".join(lines).strip() + "\n"
```

- [ ] **Step 4: Update export engine to use the formatter**

In `export_tasks_as_document()`, replace the block that builds `task_lines`, calls `chat_completion()`, and checks `doc_content` with:

```python
    doc_content = format_task_export_markdown(title=title, tasks=tasks)
    if not doc_content:
        return None
```

Remove the now-unused `settings = load_settings()` line inside `export_tasks_as_document()`.

- [ ] **Step 5: Run formatter tests to verify they pass**

Run:

```bash
PYTHONPATH=backend python -m unittest backend.tests.test_task_export_format -v
```

Expected: PASS with 2 tests.

- [ ] **Step 6: Commit deterministic formatter**

Run:

```bash
git add backend/loop_ai/orchestrator/orchestrator.py backend/tests/test_task_export_format.py
git commit -m "feat: render task exports deterministically"
```

---

### Task 2: Direct Backend Export Route

**Files:**
- Modify: `backend/app/routes.py`
- Create: `backend/tests/test_task_export_route.py`

- [ ] **Step 1: Write failing route tests**

Create `backend/tests/test_task_export_route.py`:

```python
import asyncio
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes import export_channel_tasks


class TaskExportRouteTest(unittest.TestCase):
    def test_returns_generated_file_for_accessible_channel(self):
        generated = {
            "id": "file-1",
            "workspace_id": "ws-1",
            "source": "generated",
            "storage_path": "ws-1/docs/file.md",
            "file_name": "Task-List.md",
            "file_size": 42,
            "content_type": "text/markdown",
            "created_by": "user-1",
            "created_at": "2026-05-08T12:00:00Z",
            "summary": "Task export: 1 task(s)",
            "project_context": "Exported from channel tasks",
            "tags": ["tasks", "export"],
            "metadata_status": "ready",
            "source_channel_id": "ch-1",
        }

        with patch("app.routes._select_channel_by_id", return_value={"id": "ch-1", "workspace_id": "ws-1"}), \
             patch("app.routes._user_can_access_workspace", return_value=True), \
             patch("app.routes.export_tasks_as_document", return_value=generated) as export_mock:
            result = asyncio.run(export_channel_tasks("ch-1", {"sub": "user-1"}))

        self.assertEqual(result, {"file": generated})
        export_mock.assert_called_once_with(
            channel_id="ch-1",
            workspace_id="ws-1",
            title="Task List",
            created_by="user-1",
        )

    def test_returns_400_when_no_confirmed_tasks_exist(self):
        with patch("app.routes._select_channel_by_id", return_value={"id": "ch-1", "workspace_id": "ws-1"}), \
             patch("app.routes._user_can_access_workspace", return_value=True), \
             patch("app.routes.export_tasks_as_document", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(export_channel_tasks("ch-1", {"sub": "user-1"}))

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "No confirmed tasks available to export")

    def test_returns_403_when_user_cannot_access_workspace(self):
        with patch("app.routes._select_channel_by_id", return_value={"id": "ch-1", "workspace_id": "ws-1"}), \
             patch("app.routes._user_can_access_workspace", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(export_channel_tasks("ch-1", {"sub": "user-1"}))

        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run route tests to verify they fail**

Run:

```bash
PYTHONPATH=backend python -m unittest backend.tests.test_task_export_route -v
```

Expected: FAIL or import error because `export_channel_tasks` does not exist yet.

- [ ] **Step 3: Add the backend route**

In `backend/app/routes.py`, add this route after `list_channel_tasks()`:

```python
@router.post("/api/channels/{channel_id}/tasks/export")
async def export_channel_tasks(
    channel_id: str,
    user: Annotated[dict, Depends(get_current_user)],
):
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")

    channel = _select_channel_by_id(channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    workspace_id = channel["workspace_id"]
    if not _user_can_access_workspace(workspace_id, uid):
        raise HTTPException(status_code=403, detail="Not a member of this workspace")

    generated = export_tasks_as_document(
        channel_id=channel_id,
        workspace_id=workspace_id,
        title="Task List",
        created_by=uid,
    )
    if not generated:
        raise HTTPException(status_code=400, detail="No confirmed tasks available to export")
    return {"file": generated}
```

- [ ] **Step 4: Run route tests to verify they pass**

Run:

```bash
PYTHONPATH=backend python -m unittest backend.tests.test_task_export_route -v
```

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit route**

Run:

```bash
git add backend/app/routes.py backend/tests/test_task_export_route.py
git commit -m "feat: add task export API route"
```

---

### Task 3: Frontend API Helper

**Files:**
- Modify: `frontend/src/lib/supabase-data.ts`
- Create: `frontend/src/lib/task-export.test.ts`

- [ ] **Step 1: Write failing API helper tests**

Create `frontend/src/lib/task-export.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportChannelTasks } from '@/lib/supabase-data';

vi.mock('@/lib/supabase', () => ({
  getAuthHeaders: vi.fn(async () => ({ Authorization: 'Bearer test-token', 'Content-Type': 'application/json' })),
  getSupabase: vi.fn(),
}));

describe('exportChannelTasks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to the channel task export route and maps the returned file', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        file: {
          id: 'file-1',
          workspace_id: 'ws-1',
          source: 'generated',
          storage_path: 'ws-1/docs/file.md',
          file_name: 'Task-List.md',
          file_size: 42,
          content_type: 'text/markdown',
          created_by: 'user-1',
          created_at: '2026-05-08T12:00:00Z',
          summary: 'Task export: 1 task(s)',
          project_context: 'Exported from channel tasks',
          tags: ['tasks', 'export'],
          metadata_status: 'ready',
          source_channel_id: 'ch-1',
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const file = await exportChannelTasks('ch-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.loopai-project.me/api/channels/ch-1/tasks/export',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      }
    );
    expect(file.id).toBe('file-1');
    expect(file.workspaceId).toBe('ws-1');
    expect(file.fileName).toBe('Task-List.md');
    expect(file.createdAt).toEqual(new Date('2026-05-08T12:00:00Z'));
  });

  it('throws the backend detail when export fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'No confirmed tasks available to export' }),
    })));

    await expect(exportChannelTasks('ch-1')).rejects.toThrow('No confirmed tasks available to export');
  });
});
```

- [ ] **Step 2: Run helper tests to verify they fail**

Run:

```bash
cd frontend && npm test -- src/lib/task-export.test.ts
```

Expected: FAIL because `exportChannelTasks` does not exist yet.

- [ ] **Step 3: Add the API helper**

In `frontend/src/lib/supabase-data.ts`, add this near the file helpers after `fetchWorkspaceFiles()`:

```typescript
export async function exportChannelTasks(channelId: string): Promise<FileRecord> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/channels/${channelId}/tasks/export`, {
    method: 'POST',
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Failed to export tasks (${res.status})`);
  }
  return toFileRecord(body.file as FileRow);
}
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run:

```bash
cd frontend && npm test -- src/lib/task-export.test.ts
```

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit helper**

Run:

```bash
git add frontend/src/lib/supabase-data.ts frontend/src/lib/task-export.test.ts
git commit -m "feat: add frontend task export API helper"
```

---

### Task 4: Inspector Export UI

**Files:**
- Modify: `frontend/src/components/inspector-panel.tsx`
- Create: `frontend/src/components/inspector-panel.test.tsx`

- [ ] **Step 1: Write failing Inspector tests**

Create `frontend/src/components/inspector-panel.test.tsx`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { InspectorPanel } from '@/components/inspector-panel';
import { useAppStore } from '@/store/app-store';
import { exportChannelTasks, fetchWorkspaceFiles } from '@/lib/supabase-data';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/supabase-data', () => ({
  exportChannelTasks: vi.fn(),
  fetchChannelTasks: vi.fn(async () => []),
  fetchWorkspaceFiles: vi.fn(async () => []),
  updateChannelSettings: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    channel: () => ({
      on: () => ({
        subscribe: () => ({ unsubscribe: vi.fn() }),
      }),
    }),
    removeChannel: vi.fn(),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null }),
        }),
      }),
    }),
  }),
}));

describe('InspectorPanel task export', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      isInspectorOpen: true,
      currentWorkspaceId: 'ws-1',
      currentChannelId: 'ch-1',
      channels: [
        {
          id: 'ch-1',
          workspaceId: 'ws-1',
          name: 'Sprint 3',
          type: 'project',
          isLlmRestricted: false,
          llmParticipationEnabled: true,
          unreadCount: 0,
        },
      ],
      actions: [],
      contextItems: [],
      tasks: [],
    });
  });

  async function renderPanel() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<InspectorPanel />);
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
    }
    container?.remove();
    root = null;
    container = null;
  });

  it('disables export when there are no confirmed tasks', async () => {
    useAppStore.setState({
      tasks: [
        {
          id: 'task-1',
          workspaceId: 'ws-1',
          channelId: 'ch-1',
          title: 'Review detected item',
          description: null,
          status: 'proposed',
          dueDate: null,
          sourceMessageId: null,
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          assignees: [],
        },
      ],
    });

    await renderPanel();

    const button = container!.querySelector('[data-testid="export-tasks-button"]') as HTMLButtonElement;
    expect(button).toBeDisabled();
  });

  it('exports confirmed tasks and refreshes workspace files', async () => {
    useAppStore.setState({
      tasks: [
        {
          id: 'task-2',
          workspaceId: 'ws-1',
          channelId: 'ch-1',
          title: 'Write export endpoint',
          description: null,
          status: 'open',
          dueDate: null,
          sourceMessageId: null,
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          assignees: [],
        },
      ],
    });
    vi.mocked(exportChannelTasks).mockResolvedValue({
      id: 'file-1',
      workspaceId: 'ws-1',
      source: 'generated',
      storagePath: 'ws-1/docs/file.md',
      fileName: 'Task-List.md',
      fileSize: 42,
      contentType: 'text/markdown',
      createdBy: 'user-1',
      createdAt: new Date('2026-05-08T12:00:00Z'),
      summary: 'Task export: 1 task(s)',
      projectContext: 'Exported from channel tasks',
      tags: ['tasks', 'export'],
      metadataStatus: 'ready',
      sourceChannelId: 'ch-1',
    });

    await renderPanel();
    const button = container!.querySelector('[data-testid="export-tasks-button"]') as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(exportChannelTasks).toHaveBeenCalledWith('ch-1');
    expect(fetchWorkspaceFiles).toHaveBeenCalledWith('ws-1');
    expect(container!.textContent).toContain('Task export created.');
  });

  it('disables the export button while export is in progress', async () => {
    useAppStore.setState({
      tasks: [
        {
          id: 'task-4',
          workspaceId: 'ws-1',
          channelId: 'ch-1',
          title: 'Wait for export',
          description: null,
          status: 'in_progress',
          dueDate: null,
          sourceMessageId: null,
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          assignees: [],
        },
      ],
    });
    let resolveExport!: (file: Awaited<ReturnType<typeof exportChannelTasks>>) => void;
    const exportPromise = new Promise<Awaited<ReturnType<typeof exportChannelTasks>>>((resolve) => {
      resolveExport = resolve;
    });
    vi.mocked(exportChannelTasks).mockReturnValue(exportPromise);

    await renderPanel();
    const button = container!.querySelector('[data-testid="export-tasks-button"]') as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(button).toBeDisabled();

    await act(async () => {
      resolveExport({
        id: 'file-2',
        workspaceId: 'ws-1',
        source: 'generated',
        storagePath: 'ws-1/docs/file-2.md',
        fileName: 'Task-List.md',
        fileSize: 42,
        contentType: 'text/markdown',
        createdBy: 'user-1',
        createdAt: new Date('2026-05-08T12:00:00Z'),
        summary: 'Task export: 1 task(s)',
        projectContext: 'Exported from channel tasks',
        tags: ['tasks', 'export'],
        metadataStatus: 'ready',
        sourceChannelId: 'ch-1',
      });
      await exportPromise;
    });

    expect(button).not.toBeDisabled();
  });

  it('shows an export error when the API call fails', async () => {
    useAppStore.setState({
      tasks: [
        {
          id: 'task-3',
          workspaceId: 'ws-1',
          channelId: 'ch-1',
          title: 'Handle errors',
          description: null,
          status: 'blocked',
          dueDate: null,
          sourceMessageId: null,
          createdBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          assignees: [],
        },
      ],
    });
    vi.mocked(exportChannelTasks).mockRejectedValue(new Error('No confirmed tasks available to export'));

    await renderPanel();
    const button = container!.querySelector('[data-testid="export-tasks-button"]') as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(container!.textContent).toContain('No confirmed tasks available to export');
  });
});
```

- [ ] **Step 2: Run Inspector tests to verify they fail**

Run:

```bash
cd frontend && npm test -- src/components/inspector-panel.test.tsx
```

Expected: FAIL because the export button and handler do not exist yet.

- [ ] **Step 3: Add export state and handler**

In `frontend/src/components/inspector-panel.tsx`, update imports:

```typescript
import { X, Clock, Brain, File, ListChecks, FileText, Bookmark, BotOff, Download, Loader2 } from 'lucide-react';
import { fetchWorkspaceFiles, fetchChannelTasks, updateChannelSettings, exportChannelTasks } from '@/lib/supabase-data';
```

Add state below the existing settings state:

```typescript
  const [exportingTasks, setExportingTasks] = useState(false);
  const [taskExportMessage, setTaskExportMessage] = useState<string | null>(null);
  const [taskExportError, setTaskExportError] = useState<string | null>(null);
```

Add this handler after `saveChannelSettings()`:

```typescript
  async function handleExportTasks() {
    if (!currentChannelId || !currentWorkspaceId) return;
    setExportingTasks(true);
    setTaskExportMessage(null);
    setTaskExportError(null);
    try {
      await exportChannelTasks(currentChannelId);
      const files = await fetchWorkspaceFiles(currentWorkspaceId);
      setWorkspaceFiles(files);
      setTaskExportMessage('Task export created.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not export tasks. Try again.';
      setTaskExportError(message);
    } finally {
      setExportingTasks(false);
    }
  }
```

Add this derived value next to `activeTasks`:

```typescript
  const canExportTasks = activeTasks.length > 0;
```

- [ ] **Step 4: Add the Tasks tab export control**

Inside the Tasks tab, replace the top of `<div className="p-4 space-y-4">` with:

```tsx
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Taskboard
                    </p>
                    {taskExportMessage && (
                      <p className="text-2xs text-muted-foreground">{taskExportMessage}</p>
                    )}
                    {taskExportError && (
                      <p className="text-2xs text-destructive">{taskExportError}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleExportTasks}
                    disabled={!canExportTasks || exportingTasks}
                    data-testid="export-tasks-button"
                    title={canExportTasks ? 'Export confirmed tasks' : 'Confirm at least one task before exporting'}
                  >
                    {exportingTasks ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Export
                  </Button>
                </div>
```

Keep the existing empty/proposed/active task rendering below this header.

- [ ] **Step 5: Run Inspector tests to verify they pass**

Run:

```bash
cd frontend && npm test -- src/components/inspector-panel.test.tsx
```

Expected: PASS with 4 tests.

- [ ] **Step 6: Commit Inspector UI**

Run:

```bash
git add frontend/src/components/inspector-panel.tsx frontend/src/components/inspector-panel.test.tsx
git commit -m "feat: add inspector task export action"
```

---

### Task 5: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run backend export tests**

Run:

```bash
PYTHONPATH=backend python -m unittest backend.tests.test_task_export_format backend.tests.test_task_export_route -v
```

Expected: PASS with 5 tests.

- [ ] **Step 2: Run frontend task export tests**

Run:

```bash
cd frontend && npm test -- src/lib/task-export.test.ts src/components/inspector-panel.test.tsx
```

Expected: PASS with 6 tests.

- [ ] **Step 3: Run full frontend test suite**

Run:

```bash
cd frontend && npm test
```

Expected: PASS for all Vitest suites.

- [ ] **Step 4: Run frontend lint**

Run:

```bash
cd frontend && npm run lint
```

Expected: exit code 0.

- [ ] **Step 5: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: exit code 0 and Vite build output.

- [ ] **Step 6: Review final diff**

Run:

```bash
git status --short
git diff --stat
git diff
```

Expected: only task export implementation files are changed.
