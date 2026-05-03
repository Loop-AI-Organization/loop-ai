import { create } from 'zustand';
import type { Workspace, Channel, Message, Action, OrchestratorStatus, ThreadSettings, Task } from '@/types';
import type { ContextItem, FileItem, User } from '@/types';

interface AppState {
  // User (from Supabase auth)
  user: User | null;

  // Navigation (driven by URL via WorkspaceChannel page)
  currentWorkspaceId: string | null;
  currentChannelId: string | null;

  // Data — channels are stored for ALL loaded workspaces (keyed by workspaceId inside each item)
  workspaces: Workspace[];
  channels: Channel[];
  messages: Message[];
  actions: Action[];
  contextItems: ContextItem[];
  files: FileItem[];

  tasks: Task[];

  // Loading (true only on the very first app load)
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

  /**
   * Replace channels for a specific workspace without touching other workspaces' channels.
   * Use this everywhere instead of setChannels to avoid cross-workspace state corruption.
   */
  mergeChannels: (workspaceId: string, channels: Channel[]) => void;

  /** Replace the ENTIRE channel list (used only for full resets e.g. logout). */
  setChannels: (channels: Channel[]) => void;

  setMessages: (messages: Message[]) => void;

  setCurrentWorkspace: (id: string | null) => void;
  setCurrentChannel: (id: string | null) => void;

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

  setTasks: (tasks: Task[]) => void;
  upsertTask: (task: Task) => void;
  removeTask: (taskId: string) => void;

  // Clarification flow: set to a message string to auto-submit from the Composer
  pendingSubmit: string | null;
  setPendingSubmit: (msg: string | null) => void;

  markChannelAsRead: (channelId: string) => void;

  /** @deprecated Compatibility stub for thread-based code still in flight. */
  setCurrentThread: (id: string | null) => void;
  /** @deprecated Compatibility stub. */
  setThreads: (threads: unknown[]) => void;
  /** @deprecated Compatibility stub. */
  addThread: (thread: unknown) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  currentWorkspaceId: null,
  currentChannelId: null,

  workspaces: [],
  channels: [],
  messages: [],
  actions: [],
  contextItems: [],
  files: [],
  tasks: [],
  pendingSubmit: null,

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

  mergeChannels: (workspaceId, channels) =>
    set((state) => ({
      channels: [
        ...state.channels.filter((c) => c.workspaceId !== workspaceId),
        ...channels,
      ],
    })),

  setChannels: (channels) => set({ channels }),
  setMessages: (messages) => set({ messages }),

  setCurrentWorkspace: (id) => set({ currentWorkspaceId: id }),
  setCurrentChannel: (id) => {
    set({ currentChannelId: id });
    if (id) get().markChannelAsRead(id);
  },

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),

  appendToMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + content } : m
      ),
    })),

  replaceMessage: (oldId, newMessage) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== oldId).concat(newMessage),
    })),

  addAction: (action) =>
    set((state) => ({ actions: [...state.actions, action] })),

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

  setPendingSubmit: (msg) => set({ pendingSubmit: msg }),
  setTasks: (tasks) => set({ tasks }),
  upsertTask: (task) =>
    set((state) => {
      const idx = state.tasks.findIndex((t) => t.id === task.id);
      if (idx === -1) return { tasks: [...state.tasks, task] };
      const next = [...state.tasks];
      next[idx] = task;
      return { tasks: next };
    }),
  removeTask: (taskId) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) })),

  markChannelAsRead: (channelId) =>
    set((state) => ({
      channels: state.channels.map((c) =>
        c.id === channelId ? { ...c, unreadCount: 0 } : c
      ),
    })),

  // --- Compatibility stubs (thread concept removed) ---
  setCurrentThread: () => {},
  setThreads: () => {},
  addThread: () => {},
}));
