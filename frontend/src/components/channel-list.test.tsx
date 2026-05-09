import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChannelList } from '@/components/channel-list';
import { useAppStore } from '@/store/app-store';
import { deleteChannel } from '@/lib/supabase-data';

const mockNavigate = vi.fn();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/lib/supabase-data', () => ({
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
}));

vi.mock('@/lib/dm', () => ({
  launchDirectMessage: vi.fn(),
  listDmCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: (e: { preventDefault: () => void }) => void }) => (
    <button type="button" onClick={() => onSelect?.({ preventDefault: () => {} })}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('ChannelList delete behavior', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  const renderComponent = async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<ChannelList />);
    });
  };

  const cleanupComponent = async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  };

  const clickButtonByText = async (text: string, index: number) => {
    const button = Array.from(container!.querySelectorAll('button')).filter((el) =>
      el.textContent?.includes(text)
    )[index] as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    await act(async () => {
      button!.click();
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      user: { id: 'user-1', name: 'A', email: 'a@test.com', status: 'online' },
      workspaces: [{ id: 'ws-1', name: 'WS', ownerId: 'owner-2' }],
      currentWorkspaceId: 'ws-1',
      currentChannelId: 'dm-1',
      channels: [
        {
          id: 'dm-1',
          workspaceId: 'ws-1',
          name: 'DM One',
          type: 'dm',
          isLlmRestricted: false,
          llmParticipationEnabled: true,
          unreadCount: 0,
        },
        {
          id: 'dm-2',
          workspaceId: 'ws-1',
          name: 'DM Two',
          type: 'dm',
          isLlmRestricted: false,
          llmParticipationEnabled: true,
          unreadCount: 0,
        },
      ],
    });
  });

  afterEach(async () => {
    await cleanupComponent();
  });

  it('falls back to another DM when deleting active DM and no project channels exist', async () => {
    vi.mocked(deleteChannel).mockResolvedValue(undefined as never);
    await renderComponent();

    await clickButtonByText('Delete', 0);
    await clickButtonByText('Delete', 2);

    expect(mockNavigate).toHaveBeenCalledWith('/app/ws-1/dm-2');
  });

  it('surfaces failure message and restores channel after failed delete', async () => {
    vi.mocked(deleteChannel).mockRejectedValue(new Error('Delete failed from API'));
    await renderComponent();

    await clickButtonByText('Delete', 0);
    await clickButtonByText('Delete', 2);

    await act(async () => {
      await Promise.resolve();
    });

    expect(container!.textContent).toContain('Delete failed from API');
    expect(useAppStore.getState().channels.some((channel) => channel.id === 'dm-1')).toBe(true);
  });
});
