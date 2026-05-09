import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceSettings from '@/pages/WorkspaceSettings';
import { useAppStore } from '@/store/app-store';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/supabase-data', () => ({
  deleteWorkspace: vi.fn(),
  fetchChannels: vi.fn().mockResolvedValue([]),
  updateWorkspace: vi.fn(),
  fetchWorkspaceMemberProfiles: vi.fn().mockResolvedValue([]),
  getWorkspaceShareCode: vi.fn().mockResolvedValue('share-code'),
  rotateWorkspaceShareCode: vi.fn(),
  removeWorkspaceMember: vi.fn(),
}));

vi.mock('@/lib/dm', () => ({
  launchDirectMessage: vi.fn(),
}));

describe('workspace settings reload regression', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      user: {
        id: 'user-1',
        name: 'User',
        email: 'user@example.com',
        status: 'online',
      },
      workspaces: [],
      channels: [],
      currentWorkspaceId: null,
      currentChannelId: null,
    });
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

  it('does not render a blank screen on direct load/reload of workspace settings', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/app/ws-1/settings']}>
          <Routes>
            <Route path="/app/:workspaceId/settings" element={<WorkspaceSettings />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('shows a safe redirect surface for invalid workspace params', async () => {
    useAppStore.setState((state) => ({
      ...state,
      dataLoading: false,
      workspaces: [
        {
          id: 'ws-2',
          name: 'Other Workspace',
          ownerId: 'user-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }));

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/app/ws-invalid/settings']}>
          <Routes>
            <Route path="/app/:workspaceId/settings" element={<WorkspaceSettings />} />
            <Route path="/app" element={<div>App Home</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('App Home');
  });
});
