import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { getSupabase } from '@/lib/supabase';
import {
  ensureDefaultWorkspaceAndChannel,
  fetchWorkspaces,
  fetchChannels,
  fetchThreads,
  fetchMessages,
} from '@/lib/supabase-data';
import type { User } from '@/types';

function authUserToUser(user: { id: string; email?: string } | null): User | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.email?.split('@')[0] ?? 'User',
    email: user.email ?? '',
    status: 'online',
  };
}

/**
 * Hydrates app store from Supabase (workspaces, channels, threads, messages) and
 * reacts to workspace/channel/thread changes to refetch.
 */
export function useAppData() {
  const {
    setUser,
    setDataLoading,
    setDataError,
    setWorkspaces,
    setChannels,
    setThreads,
    setMessages,
    setCurrentWorkspace,
    setCurrentChannel,
    setCurrentThread,
    currentWorkspaceId,
    currentChannelId,
    currentThreadId,
    dataLoading,
    dataError,
  } = useAppStore();

  const initialLoadDone = useRef(false);
  const skipWorkspaceEffect = useRef(true);
  const skipChannelEffect = useRef(true);
  const skipThreadEffect = useRef(true);

  // Auth state
  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ? authUserToUser(session.user) : null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? authUserToUser(session.user) : null);
    });
    return () => subscription.unsubscribe();
  }, [setUser]);

  // Initial load: ensure default workspace/channel, then load workspaces -> channels -> threads -> messages
  useEffect(() => {
    let cancelled = false;

    async function initialHydrate() {
      setDataError(null);
      try {
        const { workspace, channel } = await ensureDefaultWorkspaceAndChannel();
        if (cancelled) return;

        const workspaces = await fetchWorkspaces();
        if (cancelled) return;
        setWorkspaces(workspaces);
        setCurrentWorkspace(workspace.id);

        const channels = await fetchChannels(workspace.id);
        if (cancelled) return;
        setChannels(channels);
        setCurrentChannel(channel.id);

        const threads = await fetchThreads(channel.id);
        if (cancelled) return;
        setThreads(threads);
        const latestThread = threads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
        setCurrentThread(latestThread?.id ?? null);

        if (latestThread) {
          const messages = await fetchMessages(latestThread.id);
          if (!cancelled) setMessages(messages);
        } else {
          setMessages([]);
        }
      } catch (e) {
        if (!cancelled) setDataError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (!cancelled) {
          setDataLoading(false);
          initialLoadDone.current = true;
          skipWorkspaceEffect.current = false;
          skipChannelEffect.current = false;
          skipThreadEffect.current = false;
        }
      }
    }

    initialHydrate();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  // When workspace changes (user switched): load channels -> threads -> messages
  useEffect(() => {
    if (!initialLoadDone.current || !currentWorkspaceId) return;
    if (skipWorkspaceEffect.current) return;

    let cancelled = false;

    async function loadWorkspaceData() {
      try {
        const channels = await fetchChannels(currentWorkspaceId!);
        if (cancelled) return;
        setChannels(channels);
        const firstChannelId = channels[0]?.id;
        if (!firstChannelId) {
          setThreads([]);
          setMessages([]);
          useAppStore.setState({ currentChannelId: null, currentThreadId: null });
          return;
        }
        // Keep current channel if it's in this workspace; otherwise use first
        const keepChannel = currentChannelId && channels.some((c) => c.id === currentChannelId);
        const channelId = keepChannel ? currentChannelId! : firstChannelId;
        if (!keepChannel) setCurrentChannel(channelId);

        const threads = await fetchThreads(channelId);
        if (cancelled) return;
        setThreads(threads);
        const latest = threads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
        setCurrentThread(latest?.id ?? null);

        if (latest) {
          const messages = await fetchMessages(latest.id);
          if (!cancelled) setMessages(messages);
        } else {
          setMessages([]);
        }
      } catch {
        // ignore
      }
    }

    loadWorkspaceData();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When channel changes: load threads -> messages
  useEffect(() => {
    if (!initialLoadDone.current || !currentChannelId) return;
    if (skipChannelEffect.current) return;

    let cancelled = false;

    async function loadChannelData() {
      try {
        const threads = await fetchThreads(currentChannelId!);
        if (cancelled) return;
        setThreads(threads);
        const latest = threads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
        setCurrentThread(latest?.id ?? null);

        if (latest) {
          const messages = await fetchMessages(latest.id);
          if (!cancelled) setMessages(messages);
        } else {
          setMessages([]);
        }
      } catch {
        // ignore
      }
    }

    loadChannelData();
    return () => {
      cancelled = true;
    };
  }, [currentChannelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When thread changes: load messages
  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (skipThreadEffect.current) return;

    if (!currentThreadId) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function loadThreadMessages() {
      try {
        const messages = await fetchMessages(currentThreadId!);
        if (!cancelled) setMessages(messages);
      } catch {
        if (!cancelled) setMessages([]);
      }
    }

    loadThreadMessages();
    return () => {
      cancelled = true;
    };
  }, [currentThreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { dataLoading, dataError };
}
