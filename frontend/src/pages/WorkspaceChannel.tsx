import { useNavigate, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { AppShell } from '@/components/app-shell';

export default function WorkspaceChannel() {
  const { workspaceId, channelId } = useParams<{ workspaceId: string; channelId: string }>();
  const {
    currentWorkspaceId,
    currentChannelId,
    setCurrentWorkspace,
    setCurrentChannel,
    workspaces,
    channels,
    dataLoading,
  } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (dataLoading || !workspaceId || !channelId) return;
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) {
      navigate('/app', { replace: true });
      return;
    }
    if (currentWorkspaceId !== workspaceId) {
      setCurrentWorkspace(workspaceId);
    }
    const channel = channels.find((c) => c.id === channelId && c.workspaceId === workspaceId);
    if (!channel) {
      // If we haven't loaded channels for this workspace yet, give useAppData time to fetch them
      const hasLoadedChannelsForWorkspace = channels.some((c) => c.workspaceId === workspaceId);
      if (hasLoadedChannelsForWorkspace) {
        navigate('/app', { replace: true });
      }
      return;
    }
    if (currentChannelId !== channelId) {
      setCurrentChannel(channelId);
    }
  }, [
    workspaceId,
    channelId,
    dataLoading,
    workspaces,
    channels,
    currentWorkspaceId,
    currentChannelId,
    setCurrentWorkspace,
    setCurrentChannel,
    navigate,
  ]);

  return <AppShell />;
}
