import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MessageBubble } from '@/components/message-bubble';
import { useAppStore } from '@/store/app-store';
import { deleteTaskViaApi } from '@/lib/supabase-data';
import type { Message, Task } from '@/types';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockTaskRows = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('@/lib/supabase-data', () => ({
  confirmTaskViaApi: vi.fn(),
  deleteMessage: vi.fn(),
  deleteTaskViaApi: vi.fn(),
  updateTaskViaApi: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({ data: mockTaskRows.rows }),
      }),
    }),
  }),
}));

describe('MessageBubble inline task cards', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.resetAllMocks();
    mockTaskRows.rows = [];
    vi.mocked(deleteTaskViaApi).mockResolvedValue(undefined);
    useAppStore.setState({
      tasks: [task('task-1', 'Finalize the Sprint 2 task export demo')],
      user: null,
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
    }
    container?.remove();
    root = null;
    container = null;
  });

  async function renderMessage(message: Message) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<MessageBubble message={message} />);
    });
  }

  it('removes an inline proposed task card after it is dismissed', async () => {
    await renderMessage({
      id: 'msg-1',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'I added this:\n\n:::task{id="task-1"}',
      createdAt: new Date(),
    });

    expect(container!.textContent).toContain('Finalize the Sprint 2 task export demo');

    await act(async () => {
      (container!.querySelector('button[title="Dismiss"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(deleteTaskViaApi).toHaveBeenCalledWith('task-1');
    expect(useAppStore.getState().tasks.some((t) => t.id === 'task-1')).toBe(false);
    expect(container!.textContent).not.toContain('Finalize the Sprint 2 task export demo');
  });

  it('upserts fetched inline tasks without updating the store inside React render', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useAppStore.setState({ tasks: [] });
    mockTaskRows.rows = [taskRow('task-2', 'Review the launch checklist')];

    await renderMessage({
      id: 'msg-2',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'I added this:\n\n:::task{id="task-2"}',
      createdAt: new Date(),
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container!.textContent).toContain('Review the launch checklist');
    expect(useAppStore.getState().tasks.some((t) => t.id === 'task-2')).toBe(true);
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining('Cannot update a component'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    consoleError.mockRestore();
  });
});

function task(id: string, title: string): Task {
  return {
    id,
    workspaceId: 'ws-1',
    channelId: 'ch-1',
    title,
    description: null,
    status: 'proposed',
    dueDate: null,
    sourceMessageId: null,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    assignees: [],
  };
}

function taskRow(id: string, title: string) {
  return {
    id,
    workspace_id: 'ws-1',
    channel_id: 'ch-1',
    title,
    description: null,
    status: 'proposed',
    due_date: null,
    source_message_id: null,
    created_by: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    task_assignees: [],
  };
}
