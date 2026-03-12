import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/app-shell';
import { useAppStore } from '@/store/app-store';

/**
 * Bare /app route. After the initial load completes, redirect to the
 * user's default workspace/channel URL so WorkspaceChannel takes over.
 */
export default function AppPage() {
  const navigate = useNavigate();
  const dataLoading = useAppStore((s) => s.dataLoading);
  const currentWorkspaceId = useAppStore((s) => s.currentWorkspaceId);
  const currentChannelId = useAppStore((s) => s.currentChannelId);

  useEffect(() => {
    if (!dataLoading && currentWorkspaceId && currentChannelId) {
      navigate(`/app/${currentWorkspaceId}/${currentChannelId}`, { replace: true });
    }
  }, [dataLoading, currentWorkspaceId, currentChannelId, navigate]);

  return <AppShell />;
}
