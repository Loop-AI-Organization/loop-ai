import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Composer } from '@/components/composer';
import { useAppStore } from '@/store/app-store';
import { insertMessage, triageAndRespond } from '@/lib/supabase-data';

const mockNavigate = vi.fn();
// Required for React 18 act() warnings in non-RTL test harnesses.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/lib/supabase-data', () => ({
  insertMessage: vi.fn(),
  uploadFile: vi.fn(),
  triageAndRespond: vi.fn(),
}));

describe('Composer AI participation guards', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useAppStore.setState({
      currentWorkspaceId: 'ws-1',
      currentChannelId: 'ch-1',
      channels: [
        {
          id: 'ch-1',
          workspaceId: 'ws-1',
          name: 'General',
          type: 'project',
          isLlmRestricted: false,
          llmParticipationEnabled: true,
          unreadCount: 0,
        },
      ],
      messages: [],
      orchestratorStatus: 'ready',
      pendingSubmit: null,
    });
  });

  const renderComposer = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<Composer />);
    });
  };

  const cleanupComposer = async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  };

  afterEach(async () => {
    await cleanupComposer();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('does not call triage when the channel is restricted but still inserts user message', async () => {
    useAppStore.setState((state) => ({
      channels: state.channels.map((channel) =>
        channel.id === 'ch-1' ? { ...channel, isLlmRestricted: true } : channel
      ),
    }));
    vi.mocked(insertMessage).mockResolvedValue({
      id: 'm-1',
      threadId: 'pending-ch-1',
      role: 'user',
      content: '@ai summarize this',
      createdAt: new Date(),
    });

    await renderComposer();
    await act(async () => {
      useAppStore.getState().setPendingSubmit('@ai summarize this');
    });
    await act(async () => {
      vi.runAllTimers();
    });
    await flush();

    expect(insertMessage).toHaveBeenCalledWith('ch-1', 'user', '@ai summarize this');
    expect(triageAndRespond).not.toHaveBeenCalled();
    expect(useAppStore.getState().messages).toHaveLength(1);
    expect(useAppStore.getState().messages[0]?.content).toBe('@ai summarize this');
  });

  it('does not call triage when llm participation is disabled but still inserts user message', async () => {
    useAppStore.setState((state) => ({
      channels: state.channels.map((channel) =>
        channel.id === 'ch-1' ? { ...channel, llmParticipationEnabled: false } : channel
      ),
    }));
    vi.mocked(insertMessage).mockResolvedValue({
      id: 'm-2',
      threadId: 'pending-ch-1',
      role: 'user',
      content: '@ai draft a status update',
      createdAt: new Date(),
    });

    await renderComposer();
    await act(async () => {
      useAppStore.getState().setPendingSubmit('@ai draft a status update');
    });
    await act(async () => {
      vi.runAllTimers();
    });
    await flush();

    expect(insertMessage).toHaveBeenCalledWith('ch-1', 'user', '@ai draft a status update');
    expect(triageAndRespond).not.toHaveBeenCalled();
    expect(useAppStore.getState().messages).toHaveLength(1);
    expect(useAppStore.getState().messages[0]?.content).toBe('@ai draft a status update');
  });
});
