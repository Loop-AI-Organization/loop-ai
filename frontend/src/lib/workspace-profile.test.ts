import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspace } from '@/lib/supabase-data';

const mockState = vi.hoisted(() => ({
  profileUpsert: vi.fn(),
  workspaceInsert: vi.fn(),
  workspaceResponses: [] as Array<{ data: unknown; error: unknown }>,
  memberInsert: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: 'user-1',
            email: 'owner@example.com',
            user_metadata: {},
          },
        },
      }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          upsert: mockState.profileUpsert,
        };
      }
      if (table === 'workspaces') {
        return {
          insert: (row: unknown) => {
            mockState.workspaceInsert(row);
            return {
              select: () => ({
                single: async () => mockState.workspaceResponses.shift(),
              }),
            };
          },
        };
      }
      if (table === 'workspace_members') {
        return {
          insert: mockState.memberInsert,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
  getAuthHeaders: vi.fn(),
}));

describe('createWorkspace profile bootstrap', () => {
  beforeEach(() => {
    mockState.profileUpsert.mockReset();
    mockState.profileUpsert.mockResolvedValue({ data: null, error: null });
    mockState.workspaceInsert.mockReset();
    mockState.memberInsert.mockReset();
    mockState.memberInsert.mockResolvedValue({ data: null, error: null });
    mockState.workspaceResponses = [];
  });

  it('creates a missing profile and retries when owner_id points at profiles', async () => {
    mockState.workspaceResponses = [
      {
        data: null,
        error: {
          code: '23503',
          message: 'insert or update on table "workspaces" violates foreign key constraint "workspaces_owner_id_fkey"',
          details: 'Key is not present in table "profiles".',
        },
      },
      {
        data: {
          id: 'workspace-1',
          user_id: 'user-1',
          owner_id: 'user-1',
          name: 'Product',
          icon: '◎',
          created_at: '2026-05-12T18:00:00Z',
        },
        error: null,
      },
    ];

    const workspace = await createWorkspace({ name: 'Product' });

    expect(workspace).toMatchObject({ id: 'workspace-1', name: 'Product', ownerId: 'user-1' });
    expect(mockState.profileUpsert).toHaveBeenCalledWith(
      { id: 'user-1', first_name: 'owner' },
      { onConflict: 'id' }
    );
    expect(mockState.profileUpsert).toHaveBeenCalledTimes(2);
    expect(mockState.workspaceInsert).toHaveBeenCalledTimes(2);
    expect(mockState.memberInsert).toHaveBeenCalledWith({
      workspace_id: 'workspace-1',
      user_id: 'user-1',
      role: 'owner',
    });
  });
});
