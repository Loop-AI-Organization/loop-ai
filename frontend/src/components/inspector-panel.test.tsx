import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { InspectorPanel } from '@/components/inspector-panel';
import { useAppStore } from '@/store/app-store';
import { exportChannelTasks, fetchChannelTasks, fetchWorkspaceFiles } from '@/lib/supabase-data';
import type { FileRecord, Task, TaskStatus } from '@/types';

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
    vi.resetAllMocks();
    vi.mocked(fetchChannelTasks).mockResolvedValue([]);
    vi.mocked(fetchWorkspaceFiles).mockResolvedValue([]);
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

  async function activateTasksTab() {
    const tasksTab = container!.querySelector('[id$="-trigger-tasks"]') as HTMLButtonElement | null;
    if (!tasksTab) throw new Error('Tasks tab not found');
    await act(async () => {
      tasksTab.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        ctrlKey: false,
      }));
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
    const tasks = [task({ id: 'task-1', status: 'proposed', title: 'Review detected item' })];
    useAppStore.setState({
      tasks,
    });
    vi.mocked(fetchChannelTasks).mockResolvedValue(tasks);

    await renderPanel();
    await activateTasksTab();

    const button = exportButton();
    expect(button).toBeDisabled();
    expect(button.title).toBe('Confirm at least one task before exporting');
  });

  it('exports confirmed tasks and refreshes workspace files', async () => {
    const tasks = [task({ id: 'task-2', status: 'open', title: 'Write export endpoint' })];
    useAppStore.setState({
      tasks,
    });
    vi.mocked(fetchChannelTasks).mockResolvedValue(tasks);
    vi.mocked(exportChannelTasks).mockResolvedValue(fileRecord('file-1'));
    vi.mocked(fetchWorkspaceFiles).mockResolvedValue([fileRecord('file-1')]);

    await renderPanel();
    await activateTasksTab();

    await act(async () => {
      exportButton().click();
    });

    expect(exportChannelTasks).toHaveBeenCalledWith('ch-1');
    expect(fetchWorkspaceFiles).toHaveBeenCalledWith('ws-1');
    expect(container!.textContent).toContain('Task export created.');
    expect(container!.querySelector('[role="status"]')?.textContent).toBe('Task export created.');
  });

  it('disables the export button while export is in progress', async () => {
    const tasks = [task({ id: 'task-4', status: 'in_progress', title: 'Wait for export' })];
    useAppStore.setState({
      tasks,
    });
    vi.mocked(fetchChannelTasks).mockResolvedValue(tasks);
    let resolveExport!: (file: FileRecord) => void;
    const exportPromise = new Promise<FileRecord>((resolve) => {
      resolveExport = resolve;
    });
    vi.mocked(exportChannelTasks).mockReturnValue(exportPromise);
    vi.mocked(fetchWorkspaceFiles).mockResolvedValue([]);

    await renderPanel();
    await activateTasksTab();

    await act(async () => {
      exportButton().click();
    });

    expect(exportButton()).toBeDisabled();

    await act(async () => {
      resolveExport(fileRecord('file-2'));
      await exportPromise;
    });

    expect(exportButton()).not.toBeDisabled();
  });

  it('shows an export error when the API call fails', async () => {
    const tasks = [task({ id: 'task-3', status: 'blocked', title: 'Handle errors' })];
    useAppStore.setState({
      tasks,
    });
    vi.mocked(fetchChannelTasks).mockResolvedValue(tasks);
    vi.mocked(exportChannelTasks).mockRejectedValue(new Error('No confirmed tasks available to export'));

    await renderPanel();
    await activateTasksTab();

    await act(async () => {
      exportButton().click();
    });

    expect(container!.textContent).toContain('No confirmed tasks available to export');
    expect(container!.querySelector('[role="alert"]')?.textContent).toBe('No confirmed tasks available to export');
  });

  it('does not mount the export button before the Tasks tab is active', async () => {
    const tasks = [task({ id: 'task-5', status: 'open', title: 'Keep tab isolated' })];
    useAppStore.setState({ tasks });
    vi.mocked(fetchChannelTasks).mockResolvedValue(tasks);

    await renderPanel();

    expect(exportButton()).toBeNull();
  });

  it('resets export feedback and ignores stale export completion after channel changes', async () => {
    const tasks = [task({ id: 'task-6', status: 'open', title: 'Slow export' })];
    useAppStore.setState({ tasks });
    vi.mocked(fetchChannelTasks).mockResolvedValue(tasks);
    let resolveExport!: (file: FileRecord) => void;
    const exportPromise = new Promise<FileRecord>((resolve) => {
      resolveExport = resolve;
    });
    vi.mocked(exportChannelTasks).mockReturnValue(exportPromise);
    vi.mocked(fetchWorkspaceFiles).mockResolvedValue([fileRecord('stale-file')]);

    await renderPanel();
    await activateTasksTab();

    await act(async () => {
      exportButton()!.click();
    });
    expect(exportButton()).toBeDisabled();

    await act(async () => {
      useAppStore.setState({
        currentChannelId: 'ch-2',
        channels: [
          {
            id: 'ch-2',
            workspaceId: 'ws-1',
            name: 'Next channel',
            type: 'project',
            isLlmRestricted: false,
            llmParticipationEnabled: true,
            unreadCount: 0,
          },
        ],
        tasks: [],
      });
      await Promise.resolve();
    });

    expect(container!.textContent).not.toContain('Task export created.');

    await act(async () => {
      resolveExport(fileRecord('stale-file'));
      await exportPromise;
    });

    expect(container!.textContent).not.toContain('Task export created.');
  });

  function exportButton() {
    return container!.querySelector('[data-testid="export-tasks-button"]') as HTMLButtonElement | null;
  }
});

function task(overrides: { id: string; status: TaskStatus; title: string }): Task {
  return {
    id: overrides.id,
    workspaceId: 'ws-1',
    channelId: 'ch-1',
    title: overrides.title,
    description: null,
    status: overrides.status,
    dueDate: null,
    sourceMessageId: null,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    assignees: [],
  };
}

function fileRecord(id: string): FileRecord {
  return {
    id,
    workspaceId: 'ws-1',
    source: 'generated',
    storagePath: `ws-1/docs/${id}.md`,
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
  };
}
