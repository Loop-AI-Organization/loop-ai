// API Client - Placeholder for real endpoint integration
// Structure ready for WebSocket streaming and REST endpoints

import type { Workspace, Channel, Thread, Message, Action } from '@/types';
import { useAppStore } from '@/store/app-store';
import { streamOverWs } from '@/lib/api/chat-ws';
import { workspaces, channels, threads, messages, actions } from './mock-data';
import { createWorkspace } from './supabase-data';
import { fuzzyMatch } from './navigation-tools';
import { findMessages, type MessageSearchResult } from './navigation-tools';

export { fuzzyMatch, findMessages, type MessageSearchResult };

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

// Tool definitions for LLM-powered workspace navigation
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required?: boolean;
  }>;
}

// System prompt for LLM context - explains platform concepts and tool usage
export const SYSTEM_PROMPT = `You are the Loop AI assistant — an AI built specifically to help with workplace collaboration and team productivity. You have access to ALL workspaces the user belongs to, including their channels, DMs, messages, files, and members.

Your role is to help users:
- Navigate between workspaces, channels, and DMs
- Find information across their workspace messages and files
- Connect with teammates and start conversations
- Understand what's happening in their team's channels

IMPORTANT BEHAVIOR:
- When users ask about non-work topics (homework, general knowledge, personal questions), politely redirect: "I'm here to help you navigate your workspace, find information, and collaborate with your team. How can I help you find something in your workspaces?"
- Never claim to be a general AI — you are purpose-built for Loop AI workspace assistance
- You can access messages, channels, and members from ANY workspace the user belongs to (not just the current one)
- When searching for content, always use the findMessages tool which searches across ALL workspaces
- Present multiple options when multiple matches are found (workspaces, people, messages, etc.)

IMPORTANT: Never show IDs, UUIDs, or internal identifiers in responses. Only display human-readable names. For example:
GOOD: "You have access to: Marketing, Engineering"
BAD: "You have access to: Marketing (id: abc-123), Engineering (id: def-456)"

FORMATTING FOR NAVIGABLE RESULTS:
When listing workspaces, channels, or other items that can be navigated to, use this EXACT format so the UI can make them clickable:
- Use markdown links with this pattern: [Display Name](workspace:slug) or [Display Name](channel:slug)
- Example: Here are your workspaces: [Marketing](workspace:marketing), [Engineering](workspace:engineering)
- For channels: [general](channel:general), [random](channel:random)
- For DMs: [John Smith](dm:john-smith)
- ALWAYS use the actual name/slug, not just IDs
- Do NOT use plain text like "Workspace: marketing" — use the link format

GOOD output examples:
- "Your workspaces: [Marketing](workspace:marketing), [Engineering](workspace:engineering)"
- "Channels: [general](channel:general), [random](channel:random)"
- "1. [Marketing](workspace:marketing) 2. [Engineering](workspace:engineering)"

BAD output examples:
- "Workspace: marketing (id: abc123)"
- "Here are your channels: general, random"
- "Workspaces: Marketing, Engineering"

Available tools: find_person, navigate_workspace, navigate_channel, navigate_dm, search_content, create_workspace, update_workspace, delete_workspace, create_channel, update_channel, delete_channel, delete_dm, send_message, create_task, update_task, list_tasks, complete_task

You have FULL CRUD capabilities:
- Create, update, or delete workspaces, channels, and DMs
- Create tasks and assign them to team members
- Send messages in channels
- List and manage tasks in any workspace

When users ask to create, update, or delete something, use the appropriate tool. When users ask about tasks, use create_task, update_task, list_tasks, or complete_task.
`;

export const NAVIGATION_TOOLS: ToolDefinition[] = [
  {
    name: "find_person",
    description: "Search for people across the platform by name, email, or job title. Returns all matches so the user can select one. Use when user asks 'find X', 'who is X', 'search for person X', 'look up X', 'find someone named X'.",
    parameters: {
      query: {
        type: "string",
        description: "Name, email, job title, or any identifying information to search for.",
        required: true,
      },
      workspace_name: {
        type: "string",
        description: "Optional: limit search to a specific workspace. If not provided, searches all workspaces.",
        required: false,
      },
    },
  },
  {
    name: "navigate_workspace",
    description: "Navigate to a workspace. Use when user says 'go to workspace X', 'take me to X workspace', 'open workspace X'.",
    parameters: {
      workspace_name: {
        type: "string",
        description: "The name of the workspace to navigate to (or partial name for fuzzy matching).",
        required: true,
      },
    },
  },
  {
    name: "navigate_channel",
    description: "Navigate to a channel within a workspace. Use when user says 'open channel X', 'go to channel X', 'switch to X channel'.",
    parameters: {
      channel_name: {
        type: "string",
        description: "The name of the channel to navigate to (or partial name for fuzzy matching).",
        required: true,
      },
      workspace_name: {
        type: "string",
        description: "Optional: the workspace to search in. If not provided, searches all workspaces.",
        required: false,
      },
    },
  },
  {
    name: "navigate_dm",
    description: "Navigate to a direct message conversation with a specific user. Creates a new DM if one doesn't exist. Use when user says 'message X', 'DM X', 'chat with X', 'open DM with X'.",
    parameters: {
      user_name: {
        type: "string",
        description: "The name, email, or partial name of the user to message.",
        required: true,
      },
      workspace_name: {
        type: "string",
        description: "Optional: the workspace to search in. If not provided, searches all workspaces.",
        required: false,
      },
    },
  },
  {
    name: "search_content",
    description: "Search through workspaces, channels, files, and messages. Use when user says 'search for X', 'find X', 'look up X'.",
    parameters: {
      query: {
        type: "string",
        description: "The search query string.",
        required: true,
      },
      search_type: {
        type: "string",
        description: "Optional: what to search ('all', 'workspaces', 'channels', 'files', 'messages'). Defaults to 'all'.",
        required: false,
      },
    },
  },
  {
    name: "create_workspace",
    description: "Create a new workspace. Use when user says 'create workspace X', 'make a new workspace called X', 'add workspace X'.",
    parameters: {
      workspace_name: {
        type: "string",
        description: "The name for the new workspace.",
        required: true,
      },
    },
  },
  {
    name: "update_workspace",
    description: "Update an existing workspace's name or icon. Use when user says 'rename workspace X to Y', 'update workspace X', 'change workspace X name'.",
    parameters: {
      workspace_id: {
        type: "string",
        description: "The ID of the workspace to update.",
        required: true,
      },
      new_name: {
        type: "string",
        description: "The new name for the workspace.",
        required: false,
      },
      new_icon: {
        type: "string",
        description: "The new icon/emoji for the workspace.",
        required: false,
      },
    },
  },
  {
    name: "delete_workspace",
    description: "Delete a workspace and all its data (channels, messages, tasks). Use when user says 'delete workspace X', 'remove workspace X', 'delete the X workspace'.",
    parameters: {
      workspace_id: {
        type: "string",
        description: "The ID of the workspace to delete.",
        required: true,
      },
    },
  },
  {
    name: "create_channel",
    description: "Create a new channel in a workspace. Use when user says 'create channel X', 'add channel X', 'make a new channel called X in workspace Y'.",
    parameters: {
      workspace_id: {
        type: "string",
        description: "The ID of the workspace to create the channel in.",
        required: true,
      },
      channel_name: {
        type: "string",
        description: "The name for the new channel.",
        required: true,
      },
      channel_type: {
        type: "string",
        description: "Optional: 'public' or 'private'. Defaults to 'project'.",
        required: false,
      },
    },
  },
  {
    name: "update_channel",
    description: "Update an existing channel's name. Use when user says 'rename channel X to Y', 'update channel X', 'change channel name'.",
    parameters: {
      channel_id: {
        type: "string",
        description: "The ID of the channel to update.",
        required: true,
      },
      new_name: {
        type: "string",
        description: "The new name for the channel.",
        required: true,
      },
    },
  },
  {
    name: "delete_channel",
    description: "Delete a channel from the workspace. Use when user says 'delete channel X', 'remove channel X', 'delete the X channel'.",
    parameters: {
      channel_id: {
        type: "string",
        description: "The ID of the channel to delete.",
        required: true,
      },
    },
  },
  {
    name: "delete_dm",
    description: "Delete a direct message conversation. Use when user says 'delete DM X', 'remove DM with X', 'delete conversation with X'.",
    parameters: {
      channel_id: {
        type: "string",
        description: "The ID of the DM channel to delete.",
        required: true,
      },
    },
  },
  {
    name: "send_message",
    description: "Send a message to a channel. Use when user says 'send message X to channel Y', 'post X in channel Y', 'message channel Y saying X'.",
    parameters: {
      channel_id: {
        type: "string",
        description: "The ID of the channel to send the message to.",
        required: true,
      },
      content: {
        type: "string",
        description: "The message content/text.",
        required: true,
      },
    },
  },
  {
    name: "create_task",
    description: "Create a new task in a workspace channel. Use when user says 'create task X', 'add task X', 'make a new task', 'assign task X to Y'.",
    parameters: {
      workspace_id: {
        type: "string",
        description: "The ID of the workspace.",
        required: true,
      },
      channel_id: {
        type: "string",
        description: "The ID of the channel to create the task in.",
        required: true,
      },
      title: {
        type: "string",
        description: "The task title/description.",
        required: true,
      },
      description: {
        type: "string",
        description: "Optional: detailed description of the task.",
        required: false,
      },
      assignee_user_id: {
        type: "string",
        description: "Optional: user ID to assign the task to.",
        required: false,
      },
      due_date: {
        type: "string",
        description: "Optional: due date in ISO format (YYYY-MM-DD).",
        required: false,
      },
    },
  },
  {
    name: "update_task",
    description: "Update an existing task's details. Use when user says 'update task X', 'change task X details', 'mark task X as done', 'reassign task X to Y'.",
    parameters: {
      task_id: {
        type: "string",
        description: "The ID of the task to update.",
        required: true,
      },
      status: {
        type: "string",
        description: "Optional: new status ('todo', 'in_progress', 'done').",
        required: false,
      },
      title: {
        type: "string",
        description: "Optional: new title for the task.",
        required: false,
      },
      description: {
        type: "string",
        description: "Optional: new description.",
        required: false,
      },
      assignee_user_id: {
        type: "string",
        description: "Optional: new user ID to assign the task to.",
        required: false,
      },
      due_date: {
        type: "string",
        description: "Optional: new due date in ISO format (YYYY-MM-DD).",
        required: false,
      },
    },
  },
  {
    name: "list_tasks",
    description: "List all tasks in a workspace, optionally filtered by assignee. Use when user says 'list tasks', 'show tasks', 'what tasks do I have', 'show my tasks', 'list tasks for X'.",
    parameters: {
      workspace_id: {
        type: "string",
        description: "The ID of the workspace to list tasks from.",
        required: true,
      },
      assignee_user_id: {
        type: "string",
        description: "Optional: filter tasks by assignee user ID.",
        required: false,
      },
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as complete/done. Use when user says 'complete task X', 'mark task X as done', 'finish task X', 'task X is done'.",
    parameters: {
      task_id: {
        type: "string",
        description: "The ID of the task to mark as complete.",
        required: true,
      },
    },
  },
];

// Build a context string with all workspaces the user has access to.
// Injected into the LLM's system context so it knows the full platform scope.
function buildWorkspaceContext(): string {
  const { workspaces } = useAppStore.getState();
  if (workspaces.length === 0) return '';
  const lines = workspaces.map(function(w) { return '- ' + w.name; });
  return '\nUser\'s accessible workspaces:\n' + lines.join('\n') + '\n';
}

// Inject workspace context as a system message so the LLM has full platform awareness.
function injectWorkspaceContext(
  messages: Array<{ role: Message['role']; content: string }>
): Array<{ role: Message['role']; content: string }> {
  const ctx = buildWorkspaceContext();
  if (!ctx) return messages;
  return [
    { role: 'system', content: ctx },
    ...messages,
  ];
}

// Streaming assistant response simulation
export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullMessage: Message) => void;
  onActionUpdate: (action: Action) => void;
}

export interface StreamAssistantOptions extends Partial<StreamCallbacks> {
  tools?: ToolDefinition[];
}

export async function streamAssistant(
  threadId: string,
  userMessage: string,
  callbacks: StreamCallbacks,
  options?: StreamAssistantOptions
): Promise<void> {
  const wsUrl =
    (import.meta.env.VITE_BACKEND_WS_URL as string | undefined) ||
    'wss://api.loopai-project.me/ws';
  const messagesPayload = buildThreadMessages(threadId);

  // Append current user message to the messages array
  if (userMessage.trim()) {
    messagesPayload.push({ role: 'user' as const, content: userMessage });
  }

  // Inject full workspace context so the LLM knows all accessible workspaces
  const ctxMessages = injectWorkspaceContext(messagesPayload);

  // Include tools in payload if provided
  const payloadTools = options?.tools
    ? NAVIGATION_TOOLS.filter(t => options.tools!.some(ut => ut.name === t.name))
    : [];

  let fullContent = '';

  try {
    await streamOverWs({
      wsUrl,
      payload: {
        type: 'user_message',
        threadId,
        messages: ctxMessages,
        tools: payloadTools.length > 0 ? payloadTools : undefined,
      },
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
export async function searchMessages(query: string, workspaceId?: string): Promise<ApiResponse<MessageSearchResult[]>> {
  try {
    const results = await findMessages(query, workspaceId);
    return { data: results, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    return { data: [], success: false, error: message };
  }
}

/**
 * Unified search across messages, channels, and files using Supabase.
 * Returns categorized results including full message context.
 */
export async function searchContent(
  query: string,
  searchType?: 'all' | 'messages' | 'channels' | 'files'
): Promise<ApiResponse<{
  messages: MessageSearchResult[];
  channels: import('@/types').Channel[];
}>> {
  try {
    const [messages] = await Promise.all([findMessages(query)]);
    return {
      data: { messages, channels: [] },
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    return { data: { messages: [], channels: [] }, success: false, error: message };
  }
}

// (WebSocket helper lives in `frontend/src/lib/api/chat-ws.ts`.)
