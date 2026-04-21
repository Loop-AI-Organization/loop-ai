import { createDmChannel, fetchWorkspaceMemberProfiles } from '@/lib/supabase-data';
import { useAppStore } from '@/store/app-store';
import type { Channel, WorkspaceMember } from '@/types';

/** Open an existing DM or create one, then ensure it is in channel store cache. */
export async function launchDirectMessage(workspaceId: string, otherUserId: string): Promise<Channel> {
  if (!workspaceId) throw new Error('Workspace is required');
  if (!otherUserId) throw new Error('Recipient is required');

  const channel = await createDmChannel(workspaceId, otherUserId);

  useAppStore.setState((state) => {
    if (state.channels.some((c) => c.id === channel.id)) {
      return state;
    }
    return { channels: [...state.channels, channel] };
  });

  return channel;
}

/** Load members that can be selected as DM recipients in the current workspace. */
export async function listDmCandidates(workspaceId: string): Promise<WorkspaceMember[]> {
  const members = await fetchWorkspaceMemberProfiles(workspaceId);
  const currentUserId = useAppStore.getState().user?.id;
  if (!currentUserId) return members;
  return members.filter((member) => member.userId !== currentUserId);
}