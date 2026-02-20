// API Client - Placeholder for real endpoint integration
// Structure ready for WebSocket streaming and REST endpoints

import type { Workspace, Channel, Thread, Message, Action } from '@/types';
import { useAppStore } from '@/store/app-store';
import { streamOverWs } from '@/lib/api/chat-ws';
import { workspaces, channels, threads, messages, actions } from './mock-data';

// Simulated network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const buildThreadMessages = (threadId: string): Array<{ role: Message['role']; content: string }> => {
  const { messages: stateMessages } = useAppStore.getState();
  const threadMessages = stateMessages.filter(
    message =>
      message.threadId === threadId &&
      message.content.trim().length > 0 &&
      (message.role === 'user' || message.role === 'assistant' || message.role === 'system')
  );

  return threadMessages.map(message => ({
    role: message.role,
    content: message.content,
  }));
};

// API Response types
interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

// Workspaces
export async function listWorkspaces(): Promise<ApiResponse<Workspace[]>> {
  await delay(100);
  return { data: workspaces, success: true };
}

export async function getWorkspace(id: string): Promise<ApiResponse<Workspace | null>> {
  await delay(50);
  const workspace = workspaces.find(w => w.id === id) || null;
  return { data: workspace, success: true };
}

// Channels
export async function listChannels(workspaceId: string): Promise<ApiResponse<Channel[]>> {
  await delay(150);
  const workspaceChannels = channels.filter(c => c.workspaceId === workspaceId);
  return { data: workspaceChannels, success: true };
}

export async function getChannel(id: string): Promise<ApiResponse<Channel | null>> {
  await delay(50);
  const channel = channels.find(c => c.id === id) || null;
  return { data: channel, success: true };
}

// Threads
export async function listThreads(channelId: string): Promise<ApiResponse<Thread[]>> {
  await delay(100);
  const channelThreads = threads.filter(t => t.channelId === channelId);
  return { data: channelThreads, success: true };
}

export async function getThread(id: string): Promise<ApiResponse<Thread | null>> {
  await delay(50);
  const thread = threads.find(t => t.id === id) || null;
  return { data: thread, success: true };
}

export async function createThread(channelId: string, title: string = 'Untitled thread'): Promise<ApiResponse<Thread>> {
  await delay(200);
  const newThread: Thread = {
    id: `th-${Date.now()}`,
    channelId,
    title,
    updatedAt: new Date(),
    messageCount: 0,
  };
  return { data: newThread, success: true };
}

// Messages
export async function listMessages(threadId: string): Promise<ApiResponse<Message[]>> {
  await delay(200);
  const threadMessages = messages.filter(m => m.threadId === threadId);
  return { data: threadMessages, success: true };
}

export async function sendMessage(threadId: string, content: string): Promise<ApiResponse<Message>> {
  await delay(100);
  const newMessage: Message = {
    id: `msg-${Date.now()}`,
    threadId,
    role: 'user',
    content,
    createdAt: new Date(),
  };
  return { data: newMessage, success: true };
}

// Streaming assistant response simulation
export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullMessage: Message) => void;
  onActionUpdate: (action: Action) => void;
}

export async function streamAssistant(
  threadId: string,
  _userMessage: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const wsUrl = (import.meta.env.VITE_BACKEND_WS_URL as string | undefined) || 'ws://localhost:4000/ws';
  const messagesPayload = buildThreadMessages(threadId);

  let fullContent = '';

  try {
    await streamOverWs({
      wsUrl,
      payload: { type: 'user_message', threadId, messages: messagesPayload },
      onEvent: (event) => {
        if (event.type === 'token' && typeof event.delta === 'string') {
          fullContent += event.delta;
          callbacks.onToken(event.delta);
          return;
        }

        if (event.type === 'error') {
          const message = typeof event.message === 'string' ? event.message : 'Unknown backend error';
          throw new Error(message);
        }
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error while streaming response.';
    const errorNote = `\n\n[Assistant Error] ${message}`;
    fullContent += errorNote;
    callbacks.onToken(errorNote);
  }

  const assistantMessage: Message = {
    id: `msg-${Date.now()}`,
    threadId,
    role: 'assistant',
    content: fullContent,
    createdAt: new Date(),
  };

  callbacks.onComplete(assistantMessage);
}

// Actions
export async function listActions(threadId: string): Promise<ApiResponse<Action[]>> {
  await delay(100);
  const threadActions = actions.filter(a => a.threadId === threadId);
  return { data: threadActions, success: true };
}

// Search
export async function searchMessages(query: string, workspaceId?: string): Promise<ApiResponse<Message[]>> {
  await delay(300);
  const lowerQuery = query.toLowerCase();
  const results = messages.filter(m => 
    m.content.toLowerCase().includes(lowerQuery)
  );
  return { data: results, success: true };
}

// (WebSocket helper lives in `frontend/src/lib/api/chat-ws.ts`.)
