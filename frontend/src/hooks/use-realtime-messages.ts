import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { fetchThreads } from '@/lib/supabase-data';
import type { Message } from '@/types';

interface MessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  user_id?: string | null;
  user_display_name?: string | null;
  created_at: string;
}

export function useRealtimeMessages() {
  const { currentChannelId, addMessage } = useAppStore();

  useEffect(() => {
    if (!supabase || !currentChannelId) return;
    let cancelled = false;
    let threadIds = new Set<string>();
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    const start = async () => {
      const threads = await fetchThreads(currentChannelId).catch(() => []);
      if (cancelled) return;
      threadIds = new Set(threads.map((t) => t.id));

      channelRef = supabase
        .channel(`messages-channel-${currentChannelId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          (payload) => {
            const row = payload.new as MessageRow;
            if (!row || !threadIds.has(row.thread_id)) return;

            const state = useAppStore.getState();
            if (state.messages.some((m) => m.id === row.id)) return;

            const msg: Message = {
              id: row.id,
              threadId: row.thread_id,
              role: row.role as Message['role'],
              content: row.content,
              createdAt: new Date(row.created_at),
              userId: row.user_id ?? null,
              userDisplayName: row.user_display_name ?? null,
            };
            addMessage(msg);
          }
        )
        .subscribe();
    };

    void start();

    return () => {
      cancelled = true;
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, [currentChannelId, addMessage]);
}

