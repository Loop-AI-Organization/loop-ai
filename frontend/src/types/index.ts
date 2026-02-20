// Loop AI Data Types

export interface Workspace {
  id: string;
  name: string;
  icon?: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  role: 'owner' | 'member';
  email?: string;
}

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  type: 'project' | 'dm';
  unreadCount: number;
  lastMessage?: string;
  avatar?: string;
}

export interface Thread {
  id: string;
  channelId: string;
  title: string;
  updatedAt: Date;
  messageCount: number;
}

export interface Message {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
}

export interface Action {
  id: string;
  threadId: string;
  label: string;
  status: 'queued' | 'running' | 'done' | 'error';
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
  icon?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  status: 'online' | 'away' | 'offline';
}

export type OrchestratorStatus = 'ready' | 'thinking' | 'running';

export interface ThreadSettings {
  mentionOnlyMode: boolean;
  cooldownSeconds: number;
  respondOnlyIfUnanswered: boolean;
}

export interface ContextItem {
  id: string;
  title: string;
  content: string;
  type: 'memory' | 'summary' | 'document';
  updatedAt: Date;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: Date;
  url: string;
}

export interface ThreadFile {
  id: string;
  threadId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  contentType: string | null;
  uploadedBy: string;
  createdAt: Date;
}
