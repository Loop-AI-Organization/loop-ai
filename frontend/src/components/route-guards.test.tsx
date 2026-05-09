import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicOnlyRoute } from '@/components/PublicOnlyRoute';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

describe('route guards regressions', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it('redirects authenticated users away from /login to /app', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/login']}>
          <PublicOnlyRoute>
            <div>Login Form</div>
          </PublicOnlyRoute>
        </MemoryRouter>
      );
    });

    expect(container.textContent).not.toContain('Login Form');
  });

  it('redirects unauthenticated users from protected routes to /login safely', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    function LocationDebug() {
      const location = useLocation();
      return <div data-testid="location">{location.pathname}</div>;
    }

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/app/ws-invalid/ch-invalid']}>
          <Routes>
            <Route
              path="/app/:workspaceId/:channelId"
              element={
                <ProtectedRoute>
                  <div>Protected Content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LocationDebug />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain('/login');
    expect(container.textContent).not.toContain('Protected Content');
  });
});
