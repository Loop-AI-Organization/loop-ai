import { create } from 'zustand';
import type { Workspace, Channel, Thread, Message, Action, OrchestratorStatus, ThreadSettings } from '@/types';
import { workspaces, channels, threads, messages, actions, contextItems, files, currentUser } from '@/lib/mock-data';
import type { ContextItem, FileItem, User } from '@/types';

interface AppState {
  // User
  user: User;
  
  // Navigation
  currentWorkspaceId: string | null;
  currentChannelId: string | null;
  currentThreadId: string | null;
  
  // Data
  workspaces: Workspace[];
  channels: Channel[];
  threads: Thread[];
  messages: Message[];
  actions: Action[];
  contextItems: ContextItem[];
  files: FileItem[];
  
  // UI State
  orchestratorStatus: OrchestratorStatus;
  isInspectorOpen: boolean;
  isSidebarOpen: boolean;
  isCommandPaletteOpen: boolean;
  streamingMessageId: string | null;
  
  // Thread settings
  threadSettings: ThreadSettings;
  
  // Actions
  setCurrentWorkspace: (id: string) => void;
  setCurrentChannel: (id: string) => void;
  setCurrentThread: (id: string | null) => void;
  
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  appendToMessage: (id: string, content: string) => void;
  
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
  createThread: (channelId: string, title?: string) => Thread;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  user: currentUser,
  currentWorkspaceId: 'ws-1',
  currentChannelId: 'ch-1',
  currentThreadId: 'th-1',
  
  workspaces,
  channels,
  threads,
  messages,
  actions,
  contextItems,
  files,
  
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
  
  // Navigation actions
  setCurrentWorkspace: (id) => set({ currentWorkspaceId: id }),
  setCurrentChannel: (id) => {
    const state = get();
    const channelThreads = state.threads.filter(t => t.channelId === id);
    const latestThread = channelThreads.sort((a, b) => 
      b.updatedAt.getTime() - a.updatedAt.getTime()
    )[0];
    
    set({ 
      currentChannelId: id,
      currentThreadId: latestThread?.id || null,
    });
    
    // Mark as read
    get().markChannelAsRead(id);
  },
  setCurrentThread: (id) => set({ currentThreadId: id }),
  
  // Message actions
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),
  
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map(m => 
      m.id === id ? { ...m, ...updates } : m
    ),
  })),
  
  appendToMessage: (id, content) => set((state) => ({
    messages: state.messages.map(m => 
      m.id === id ? { ...m, content: m.content + content } : m
    ),
  })),
  
  // Action actions
  addAction: (action) => set((state) => ({
    actions: [...state.actions, action],
  })),
  
  updateAction: (id, updates) => set((state) => ({
    actions: state.actions.map(a => 
      a.id === id ? { ...a, ...updates } : a
    ),
  })),
  
  clearStreamingActions: () => set((state) => ({
    actions: state.actions.filter(a => !a.id.startsWith('act-stream-')),
  })),
  
  // Status actions
  setOrchestratorStatus: (status) => set({ orchestratorStatus: status }),
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),
  
  // UI actions
  toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  
  // Settings
  updateThreadSettings: (settings) => set((state) => ({
    threadSettings: { ...state.threadSettings, ...settings },
  })),
  
  // Channel actions
  markChannelAsRead: (channelId) => set((state) => ({
    channels: state.channels.map(c => 
      c.id === channelId ? { ...c, unreadCount: 0 } : c
    ),
  })),
  
  createThread: (channelId, title = 'Untitled thread') => {
    const newThread: Thread = {
      id: `th-${Date.now()}`,
      channelId,
      title,
      updatedAt: new Date(),
      messageCount: 0,
    };
    
    set((state) => ({
      threads: [...state.threads, newThread],
      currentThreadId: newThread.id,
    }));
    
    return newThread;
  },
}));
