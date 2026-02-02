// API Client - Placeholder for real endpoint integration
// Structure ready for WebSocket streaming and REST endpoints

import type { Workspace, Channel, Thread, Message, Action } from '@/types';
import { workspaces, channels, threads, messages, actions, demoStreamingContent, demoActions } from './mock-data';

// Simulated network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  // Create initial actions
  const streamActions: Action[] = demoActions.map((a, i) => ({
    ...a,
    id: `act-stream-${Date.now()}-${i}`,
    threadId,
    status: 'queued' as const,
  }));

  // Emit initial actions
  streamActions.forEach(action => callbacks.onActionUpdate(action));

  // Simulate action progression
  for (let i = 0; i < streamActions.length; i++) {
    await delay(300 + Math.random() * 200);
    
    // Start action
    streamActions[i] = { 
      ...streamActions[i], 
      status: 'running',
      startedAt: new Date(),
    };
    callbacks.onActionUpdate(streamActions[i]);

    await delay(400 + Math.random() * 300);

    // Complete action
    streamActions[i] = { 
      ...streamActions[i], 
      status: 'done',
      completedAt: new Date(),
    };
    callbacks.onActionUpdate(streamActions[i]);
  }

  // Stream text tokens
  const words = demoStreamingContent.split(' ');
  let fullContent = '';

  for (const word of words) {
    await delay(30 + Math.random() * 20);
    fullContent += (fullContent ? ' ' : '') + word;
    callbacks.onToken(word + ' ');
  }

  // Complete
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

// WebSocket connection placeholder
export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(url: string = 'wss://api.loop.ai/ws') {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // In production, this would connect to real WebSocket
      console.log('[WebSocket] Would connect to:', this.url);
      resolve();
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(event: string, data: unknown): void {
    console.log('[WebSocket] Would send:', event, data);
  }

  on(event: string, callback: (data: unknown) => void): void {
    console.log('[WebSocket] Would listen for:', event);
  }
}

export const wsClient = new WebSocketClient();
