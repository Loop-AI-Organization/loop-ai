import { create } from 'zustand';
import type { Workspace, Channel, Thread, Message, Action, OrchestratorStatus, ThreadSettings } from '@/types';
import type { ContextItem, FileItem, User } from '@/types';

interface AppState {
  // User (from Supabase auth)
  user: User | null;

  // Navigation
  currentWorkspaceId: string | null;
  currentChannelId: string | null;
  currentThreadId: string | null;

  // Data (from Supabase; RLS = per-user)
  workspaces: Workspace[];
  channels: Channel[];
  threads: Thread[];
  messages: Message[];
  actions: Action[];
  contextItems: ContextItem[];
  files: FileItem[];

  // Loading
  dataLoading: boolean;
  dataError: string | null;

  // UI State
  orchestratorStatus: OrchestratorStatus;
  isInspectorOpen: boolean;
  isSidebarOpen: boolean;
  isCommandPaletteOpen: boolean;
  streamingMessageId: string | null;

  threadSettings: ThreadSettings;

  // Actions
  setUser: (user: User | null) => void;
  setDataLoading: (loading: boolean) => void;
  setDataError: (error: string | null) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setChannels: (channels: Channel[]) => void;
  setThreads: (threads: Thread[]) => void;
  setMessages: (messages: Message[]) => void;

  setCurrentWorkspace: (id: string) => void;
  setCurrentChannel: (id: string) => void;
  setCurrentThread: (id: string | null) => void;

  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  appendToMessage: (id: string, content: string) => void;
  replaceMessage: (oldId: string, newMessage: Message) => void;

  addAction: (action: Action) => void;
  updateAction: (id: string, updates: Partial<Action>) => void;
  clearStreamingActions: () => void;

  setOrchestratorStatus: (status: OrchestratorStatus) => void;
  setStreamingMessageId: (id: string | null) => void;

  toggleInspector: () => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;

  updateThreadSettings: (settings: Partial<ThreadSettings>) => void;

  markChannelAsRead: (channelId: string) => void;
  /** Add a thread from Supabase (e.g. after createThread in supabase-data). */
  addThread: (thread: Thread) => void;
  /** Legacy sync createThread: only updates local state; use supabase-data createThread + addThread for real. */
  createThread: (channelId: string, title?: string) => Thread;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  currentWorkspaceId: null,
  currentChannelId: null,
  currentThreadId: null,

  workspaces: [],
  channels: [],
  threads: [],
  messages: [],
  actions: [],
  contextItems: [],
  files: [],

  dataLoading: true,
  dataError: null,

  orchestratorStatus: 'ready',
  isInspectorOpen: true,
  isSidebarOpen: true,
  isCommandPaletteOpen: false,
  streamingMessageId: null,

  threadSettings: {
    mentionOnlyMode: false,
    cooldownSeconds: 0,
    respondOnlyIfUnanswered: false,
  },

  setUser: (user) => set({ user }),
  setDataLoading: (dataLoading) => set({ dataLoading }),
  setDataError: (dataError) => set({ dataError }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setChannels: (channels) => set({ channels }),
  setThreads: (threads) => set({ threads }),
  setMessages: (messages) => set({ messages }),

  setCurrentWorkspace: (id) => set({ currentWorkspaceId: id }),
  setCurrentChannel: (id) => {
    const state = get();
    const channelThreads = state.threads.filter((t) => t.channelId === id);
    const latestThread = channelThreads.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )[0];
    set({
      currentChannelId: id,
      currentThreadId: latestThread?.id ?? null,
    });
    get().markChannelAsRead(id);
  },
  setCurrentThread: (id) => set({ currentThreadId: id }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),

  appendToMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, content: m.content + content } : m)),
    })),

  replaceMessage: (oldId, newMessage) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== oldId).concat(newMessage),
    })),

  addAction: (action) =>
    set((state) => ({
      actions: [...state.actions, action],
    })),

  updateAction: (id, updates) =>
    set((state) => ({
      actions: state.actions.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  clearStreamingActions: () =>
    set((state) => ({
      actions: state.actions.filter((a) => !a.id.startsWith('act-stream-')),
    })),

  setOrchestratorStatus: (status) => set({ orchestratorStatus: status }),
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),

  toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),

  updateThreadSettings: (settings) =>
    set((state) => ({
      threadSettings: { ...state.threadSettings, ...settings },
    })),

  markChannelAsRead: (channelId) =>
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId ? { ...c, unreadCount: 0 } : c
      ),
    })),

  addThread: (thread) =>
    set((state) => ({
      threads: [thread, ...state.threads],
      currentThreadId: thread.id,
    })),

  createThread: (channelId, title = 'Untitled thread') => {
    const newThread: Thread = {
      id: `th-local-${Date.now()}`,
      channelId,
      title,
      updatedAt: new Date(),
      messageCount: 0,
    };
    set((state) => ({
      threads: [newThread, ...state.threads],
      currentThreadId: newThread.id,
    }));
    return newThread;
  },
}));
