import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import type { Message } from '@/types';

interface MessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  created_at: string;
}

export function useRealtimeMessages() {
  const { currentThreadId, addMessage } = useAppStore();

  useEffect(() => {
    if (!supabase || !currentThreadId) return;

    const channel = supabase
      .channel(`messages-thread-${currentThreadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${currentThreadId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (!row || row.thread_id !== currentThreadId) return;

          const state = useAppStore.getState();
          if (state.messages.some((m) => m.id === row.id)) return;

          const msg: Message = {
            id: row.id,
            threadId: row.thread_id,
            role: row.role as Message['role'],
            content: row.content,
            createdAt: new Date(row.created_at),
          };
          addMessage(msg);
        }
      )
      .subscribe();

    return () => {
      supabase && supabase.removeChannel(channel);
    };
  }, [currentThreadId, addMessage]);
}

