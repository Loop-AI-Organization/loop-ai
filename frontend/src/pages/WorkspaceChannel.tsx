import { useNavigate, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { AppShell } from '@/components/app-shell';

export default function WorkspaceChannel() {
  const { workspaceId, channelId } = useParams<{ workspaceId: string; channelId: string }>();
  const { setCurrentWorkspace, setCurrentChannel, workspaces, channels } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    // Validate and set workspace
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (!workspace) {
      navigate('/app');
      return;
    }
    setCurrentWorkspace(workspaceId!);

    // Validate and set channel
    const channel = channels.find(c => c.id === channelId && c.workspaceId === workspaceId);
    if (!channel) {
      navigate('/app');
      return;
    }
    setCurrentChannel(channelId!);
  }, [workspaceId, channelId, setCurrentWorkspace, setCurrentChannel, workspaces, channels, navigate]);

  return <AppShell />;
}
