import { beforeEach, describe, expect, it, vi } from 'vitest';
import { launchDirectMessage, listDmCandidates } from '@/lib/dm';
import { useAppStore } from '@/store/app-store';
import { createDmChannel, fetchWorkspaceMemberProfiles } from '@/lib/supabase-data';

vi.mock('@/lib/supabase-data', () => ({
  createDmChannel: vi.fn(),
  fetchWorkspaceMemberProfiles: vi.fn(),
}));

describe('dm helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      user: {
        id: 'me-user-id',
        name: 'Me',
        email: 'me@example.com',
        status: 'online',
      },
      channels: [],
    });
  });

  it('adds a newly created DM channel to the store', async () => {
    vi.mocked(createDmChannel).mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
      name: 'DM',
      type: 'dm',
      isLlmRestricted: false,
      llmParticipationEnabled: true,
      unreadCount: 0,
    });

    const channel = await launchDirectMessage('ws-1', 'other-user-id');

    expect(createDmChannel).toHaveBeenCalledWith('ws-1', 'other-user-id');
    expect(channel.id).toBe('dm-1');
    expect(useAppStore.getState().channels).toHaveLength(1);
    expect(useAppStore.getState().channels[0]?.id).toBe('dm-1');
  });

  it('does not duplicate an existing DM channel in store', async () => {
    useAppStore.setState({
      channels: [
        {
          id: 'dm-1',
          workspaceId: 'ws-1',
          name: 'DM',
          type: 'dm',
          isLlmRestricted: false,
          llmParticipationEnabled: true,
          unreadCount: 0,
        },
      ],
    });

    vi.mocked(createDmChannel).mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
      name: 'DM',
      type: 'dm',
      isLlmRestricted: false,
      llmParticipationEnabled: true,
      unreadCount: 0,
    });

    await launchDirectMessage('ws-1', 'other-user-id');

    expect(useAppStore.getState().channels).toHaveLength(1);
  });

  it('keeps a single channel entry across repeated backend-backed launches', async () => {
    vi.mocked(createDmChannel).mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
      name: 'DM',
      type: 'dm',
      isLlmRestricted: false,
      llmParticipationEnabled: true,
      unreadCount: 0,
    });

    await launchDirectMessage('ws-1', 'other-user-id');
    await launchDirectMessage('ws-1', 'other-user-id');

    expect(createDmChannel).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().channels).toHaveLength(1);
    expect(useAppStore.getState().channels[0]?.id).toBe('dm-1');
  });

  it('returns DM candidates excluding current user', async () => {
    vi.mocked(fetchWorkspaceMemberProfiles).mockResolvedValue([
      {
        id: 'm1',
        userId: 'me-user-id',
        role: 'owner',
        email: 'me@example.com',
        displayName: 'Me',
      },
      {
        id: 'm2',
        userId: 'other-user-id',
        role: 'member',
        email: 'other@example.com',
        displayName: 'Other',
      },
    ]);

    const members = await listDmCandidates('ws-1');

    expect(members).toHaveLength(1);
    expect(members[0]?.userId).toBe('other-user-id');
  });

  it('propagates DM creation errors without mutating channel cache', async () => {
    vi.mocked(createDmChannel).mockRejectedValue(new Error('create failed'));

    await expect(launchDirectMessage('ws-1', 'other-user-id')).rejects.toThrow('create failed');
    expect(useAppStore.getState().channels).toHaveLength(0);
  });
});
