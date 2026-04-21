// Loop AI Data Types

export interface Workspace {
  id: string;
  name: string;
  icon?: string;
  ownerId?: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  role: 'owner' | 'member';
  email?: string;
  displayName?: string;
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

/** @deprecated Legacy compatibility type while messages are still backed by thread rows. */
export interface Thread {
  id: string;
  channelId: string;
  title: string;
  updatedAt: Date;
  messageCount: number;
}

export interface FileRecord {
  id: string;
  workspaceId: string;
  source: 'upload' | 'generated';
  storagePath: string;
  fileName: string;
  fileSize: number;
  contentType: string | null;
  createdBy: string | null;
  createdAt: Date;
  summary: string | null;
  projectContext: string | null;
  tags: string[] | null;
  metadataStatus: 'pending' | 'ready' | 'failed';
  sourceChannelId: string | null;
}

export interface Message {
  id: string;
  /** @deprecated Internal compatibility ID; UI is channel-scoped. */
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: Date;
  userId?: string | null;
  userDisplayName?: string | null;
  isStreaming?: boolean;
  files?: FileRecord[];
}

export interface Action {
  id: string;
  /** @deprecated Internal compatibility ID; actions are displayed per channel flow. */
  threadId: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
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
