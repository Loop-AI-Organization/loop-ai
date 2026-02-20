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
    const channelsForWorkspace = channels.filter((c) => c.workspaceId === workspaceId);
    if (!channel) {
      if (channelsForWorkspace.length > 0) {
        navigate('/app', { replace: true });
        return;
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
