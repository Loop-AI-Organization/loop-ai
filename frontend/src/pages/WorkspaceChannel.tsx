import { useNavigate, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { AppShell } from '@/components/app-shell';
import { fetchChannels, fetchMessages } from '@/lib/supabase-data';

/**
 * URL-driven data loader.
 *
 * This is the single place that translates URL params into store state and
 * triggers data fetches. All navigation elsewhere (workspace switch, settings
 * back button, channel delete, etc.) just calls navigate() — this component
 * takes care of the rest.
 */
export default function WorkspaceChannel() {
  const { workspaceId, channelId } = useParams<{
    workspaceId: string;
    channelId: string;
  }>();
  const navigate = useNavigate();

  // Subscribe only to the flags/collections we need to react to.
  const dataLoading = useAppStore((s) => s.dataLoading);

  useEffect(() => {
    if (dataLoading || !workspaceId || !channelId) return;

    const state = useAppStore.getState();

    // Validate that the workspace exists in the user's list.
    const workspace = state.workspaces.find((w) => w.id === workspaceId);
    if (!workspace) {
      // Unknown workspace — fall back to the first known workspace/channel.
      const fallbackWs = state.workspaces[0];
      if (fallbackWs) {
        const fallbackChs = state.channels.filter(
          (c) => c.workspaceId === fallbackWs.id
        );
        const fallbackCh = fallbackChs[0];
        if (fallbackCh) {
          navigate(`/app/${fallbackWs.id}/${fallbackCh.id}`, { replace: true });
          return;
        }
      }
      navigate('/app', { replace: true });
      return;
    }

    // Immediately commit the navigation to the store and clear stale messages.
    useAppStore.setState({
      currentWorkspaceId: workspaceId,
      currentChannelId: channelId,
      messages: [],
    });
    // Mark as read right away.
    useAppStore.getState().markChannelAsRead(channelId);

    let cancelled = false;

    async function loadData() {
      // ── 1. Load channels for this workspace if not cached ────────────────
      const hasChannels = useAppStore
        .getState()
        .channels.some((c) => c.workspaceId === workspaceId);

      if (!hasChannels) {
        const fetched = await fetchChannels(workspaceId!);
        if (cancelled) return;
        // Merge: keep other workspaces' channels intact.
        useAppStore.setState((s) => ({
          channels: [
            ...s.channels.filter((c) => c.workspaceId !== workspaceId),
            ...fetched,
          ],
        }));
      }

      // ── 2. Validate that the target channel belongs to this workspace ─────
      const latestChannels = useAppStore
        .getState()
        .channels.filter((c) => c.workspaceId === workspaceId);

      const channelExists = latestChannels.some((c) => c.id === channelId);
      if (!channelExists) {
        if (cancelled) return;
        const general =
          latestChannels.find((c) => c.name === 'general') ?? latestChannels[0];
        if (general) {
          navigate(`/app/${workspaceId}/${general.id}`, { replace: true });
        } else {
          navigate('/app', { replace: true });
        }
        return;
      }

      // ── 3. Load messages for the channel ────────────────────────────────
      const msgs = await fetchMessages(channelId!);
      if (cancelled) return;
      // Only apply if the user hasn't navigated away while we were fetching.
      if (useAppStore.getState().currentChannelId === channelId) {
        useAppStore.setState({ messages: msgs });
      }
    }

    loadData().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [workspaceId, channelId, dataLoading, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  return <AppShell />;
}
