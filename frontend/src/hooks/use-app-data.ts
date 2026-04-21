import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { getSupabase } from '@/lib/supabase';
import {
  ensureDefaultWorkspaceAndChannel,
  fetchWorkspaces,
  fetchChannels,
  fetchMessages,
} from '@/lib/supabase-data';
import type { User } from '@/types';

function authUserToUser(
  user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null
): User | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
    email: user.email ?? '',
    status: 'online',
  };
}

/**
 * One-time bootstrap hook (auth + initial data load).
 *
 * Deliberately does NOT react to currentWorkspaceId / currentChannelId changes.
 * Data loading after navigation is handled by WorkspaceChannel.tsx (URL-driven).
 * This avoids races between the reactive effects and explicit navigation code.
 */
export function useAppData() {
  const { setUser, setDataLoading, setDataError, dataLoading, dataError } = useAppStore();

  // ── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ? authUserToUser(session.user) : null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? authUserToUser(session.user) : null);
    });
    return () => subscription.unsubscribe();
  }, [setUser]);

  // ── Initial load (runs once per session, not on every remount) ────────────
  useEffect(() => {
    // If workspaces are already in the store (e.g. AppShell remounted after
    // navigating back from WorkspaceSettings), skip the full load entirely.
    const existing = useAppStore.getState();
    if (existing.workspaces.length > 0) {
      if (existing.dataLoading) setDataLoading(false);
      return;
    }

    let cancelled = false;

    async function initialHydrate() {
      setDataError(null);
      try {
        const { workspace: ensuredWorkspace, channel: ensuredChannel } = await ensureDefaultWorkspaceAndChannel();
        if (cancelled) return;

        const workspaces = await fetchWorkspaces();
        if (cancelled) return;

        // Preserve current selection where possible (for remounts/navigation)
        const initialState = useAppStore.getState();
        const workspace =
          workspaces.find((w) => w.id === initialState.currentWorkspaceId) ??
          workspaces.find((w) => w.id === ensuredWorkspace.id) ??
          workspaces[0];

        if (!workspace) {
          useAppStore.setState({
            workspaces: [],
            channels: [],
            messages: [],
            currentWorkspaceId: null,
            currentChannelId: null,
          });
          return;
        }

        const channels = await fetchChannels(workspace.id);
        if (cancelled) return;

        const channel =
          channels.find((c) => c.id === initialState.currentChannelId) ??
          channels.find((c) => c.id === ensuredChannel.id) ??
          channels[0];

        if (!channel) {
          useAppStore.setState({
            workspaces,
            channels,
            messages: [],
            currentWorkspaceId: workspace.id,
            currentChannelId: null,
          });
          return;
        }

        const messages = await fetchMessages(channel.id);
        if (cancelled) return;

        // Batch-write to minimize renders during initial bootstrap.
        useAppStore.setState({
          workspaces,
          channels,
          messages,
          currentWorkspaceId: workspace.id,
          currentChannelId: channel.id,
        });
      } catch (e) {
        if (!cancelled)
          setDataError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    initialHydrate();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: run once

  return { dataLoading, dataError };
}
