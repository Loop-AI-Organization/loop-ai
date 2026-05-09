import { StrictMode, act, createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppData } from '@/hooks/use-app-data';
import { useAppStore } from '@/store/app-store';

const authGetSession = vi.fn();
const authOnAuthStateChange = vi.fn();

const ensureDefaultWorkspaceAndChannel = vi.fn();
const fetchWorkspaces = vi.fn();
const fetchChannels = vi.fn();
const fetchMessages = vi.fn();

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: authGetSession,
      onAuthStateChange: authOnAuthStateChange,
    },
  }),
}));

vi.mock('@/lib/supabase-data', () => ({
  ensureDefaultWorkspaceAndChannel: (...args: unknown[]) => ensureDefaultWorkspaceAndChannel(...args),
  fetchWorkspaces: (...args: unknown[]) => fetchWorkspaces(...args),
  fetchChannels: (...args: unknown[]) => fetchChannels(...args),
  fetchMessages: (...args: unknown[]) => fetchMessages(...args),
}));

function TestHarness() {
  useAppData();
  return null;
}

describe('useAppData bootstrap regression', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      user: null,
      workspaces: [],
      channels: [],
      messages: [],
      currentWorkspaceId: null,
      currentChannelId: null,
      dataLoading: true,
      dataError: null,
    });

    authGetSession.mockResolvedValue({ data: { session: null } });
    authOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    ensureDefaultWorkspaceAndChannel.mockResolvedValue({
      workspace: { id: 'ws-1' },
      channel: { id: 'ch-1' },
    });
    fetchWorkspaces.mockResolvedValue([
      { id: 'ws-1', name: 'Workspace', ownerId: 'owner-1', createdAt: new Date() },
    ]);
    fetchChannels.mockResolvedValue([
      {
        id: 'ch-1',
        workspaceId: 'ws-1',
        name: 'general',
        type: 'project',
        isLlmRestricted: false,
        llmParticipationEnabled: true,
        unreadCount: 0,
      },
    ]);
    fetchMessages.mockResolvedValue([]);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it('deduplicates bootstrap fetches during StrictMode mount', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(createElement(StrictMode, null, createElement(TestHarness)));
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useAppStore.getState().dataLoading).toBe(false);
    expect(ensureDefaultWorkspaceAndChannel).toHaveBeenCalledTimes(1);
    expect(fetchWorkspaces).toHaveBeenCalledTimes(1);
    expect(fetchChannels).toHaveBeenCalledTimes(1);
    expect(fetchMessages).toHaveBeenCalledTimes(1);
  });

  it('skips bootstrap fetches when store is already hydrated', async () => {
    useAppStore.setState({
      workspaces: [{ id: 'ws-ready', name: 'Ready', ownerId: 'owner-1', icon: '◎' }],
      channels: [],
      currentWorkspaceId: 'ws-ready',
      dataLoading: true,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(createElement(StrictMode, null, createElement(TestHarness)));
    });

    expect(useAppStore.getState().dataLoading).toBe(false);
    expect(ensureDefaultWorkspaceAndChannel).toHaveBeenCalledTimes(0);
    expect(fetchWorkspaces).toHaveBeenCalledTimes(0);
    expect(fetchChannels).toHaveBeenCalledTimes(0);
    expect(fetchMessages).toHaveBeenCalledTimes(0);
  });
});
