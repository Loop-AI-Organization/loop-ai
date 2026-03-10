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
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface MessageRow {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
}

function authUserToUser(user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null): User | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
    email: user.email ?? '',
    status: 'online',
  };
}

function rowToMessage(r: MessageRow) {
  return {
    id: r.id,
    threadId: r.thread_id,
    role: r.role,
    content: r.content,
    createdAt: new Date(r.created_at),
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
      // Clear old data synchronously so UI doesn't flash stale channels
      setChannels([]);
      setThreads([]);
      setMessages([]);
      
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
        // Keep current channel if it's in this workspace; otherwise use first.
        // Read latest store state here (instead of closed-over value) so explicit
        // navigation actions are not overwritten by this effect.
        const latestChannelId = useAppStore.getState().currentChannelId;
        const keepChannel = latestChannelId && channels.some((c) => c.id === latestChannelId);
        const channelId = keepChannel ? latestChannelId! : firstChannelId;
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

  // Realtime: keep current thread messages in sync without page reload
  useEffect(() => {
    if (!initialLoadDone.current || !currentThreadId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`messages:thread:${currentThreadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${currentThreadId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
          const next = payload.new as MessageRow;
          if (!next?.id) return;
          const state = useAppStore.getState();
          if (state.messages.some((m) => m.id === next.id)) return; // dedupe local + realtime echo
          state.addMessage(rowToMessage(next));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${currentThreadId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
          const next = payload.new as MessageRow;
          if (!next?.id) return;
          useAppStore.getState().updateMessage(next.id, {
            role: next.role,
            content: next.content,
            createdAt: new Date(next.created_at),
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${currentThreadId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: any }>) => {
          const oldRow = payload.old as Partial<MessageRow> | null;
          if (!oldRow?.id) return;
          useAppStore.setState((state) => ({
            messages: state.messages.filter((m) => m.id !== oldRow.id),
          }));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentThreadId]);

  return { dataLoading, dataError };
}
