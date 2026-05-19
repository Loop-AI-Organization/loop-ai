import { useAppStore } from '@/store/app-store';
import { launchDirectMessage, listDmCandidates } from './dm';
import { getSupabase } from './supabase';
import { createWorkspace, searchPeople } from './supabase-data';
import {
  updateWorkspace as supabaseUpdateWorkspace,
  deleteWorkspace as supabaseDeleteWorkspace,
  createChannel as supabaseCreateChannel,
  updateChannel as supabaseUpdateChannel,
  deleteChannel as supabaseDeleteChannel,
  insertMessage as supabaseInsertMessage,
  createTask as supabaseCreateTask,
  updateTaskViaApi as supabaseUpdateTask,
  updateTaskStatus as supabaseUpdateTaskStatus,
  fetchChannelTasks as supabaseFetchChannelTasks,
  fetchWorkspaceMemberProfiles,
  findExistingDm,
} from './supabase-data';
import type { Task, TaskStatus } from '@/types';

/**
 * Fuzzy match helper - matches if query is contained in text or all query words are found.
 * Used for workspace/channel/user navigation with partial matches.
 */
export function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase().trim();
  return lower.includes(q) || q.split(/\s+/).every(word => lower.includes(word));
}

/**
 * Find workspaces by name with fuzzy matching.
 * Returns all matches sorted by relevance.
 */
export function findWorkspaces(query: string): import('@/types').Workspace[] {
  const { workspaces } = useAppStore.getState();
  const lower = query.toLowerCase().trim();
  return workspaces.filter(w => fuzzyMatch(w.name, query));
}

/**
 * Find channels by name with fuzzy matching, optionally filtered by workspace.
 * Returns all matches sorted by relevance.
 */
export function findChannels(
  query: string,
  workspaceId?: string
): import('@/types').Channel[] {
  const { channels, workspaces } = useAppStore.getState();
  let targetChannels = channels;

  if (workspaceId) {
    targetChannels = channels.filter(c => c.workspaceId === workspaceId);
  }

  return targetChannels.filter(c => fuzzyMatch(c.name, query));
}

/**
 * Find people (workspace members) by name, email, or job title.
 * Searches across all workspaces or a specific one via Supabase.
 * Returns ALL matches so the caller can present options to the user.
 *
 * Uses supabase-data searchPeople which queries the profiles + workspace_members
 * tables directly in Supabase for better performance and consistency.
 */
export async function findPeople(
  query: string,
  workspaceId?: string
): Promise<import('@/types').WorkspaceMember[]> {
  // Delegate to supabase-data searchPeople which queries Supabase directly
  return searchPeople(query, workspaceId);
}

/**
 * Get or create a DM channel for a user.
 * Returns the channel and the matched member info.
 */
export async function getOrCreateDm(
  userId: string,
  workspaceId: string
): Promise<{ channel: import('@/types').Channel; member: import('@/types').WorkspaceMember }> {
  // Get member info
  const members = await listDmCandidates(workspaceId);
  const member = members.find(m => m.userId === userId);

  if (!member) {
    throw new Error('User not found in workspace');
  }

  // Get or create DM channel
  const channel = await launchDirectMessage(workspaceId, userId);

  return { channel, member };
}

/**
 * Search across all content types.
 * Returns categorized results.
 */
export async function searchAll(
  query: string
): Promise<{
  workspaces: import('@/types').Workspace[];
  channels: import('@/types').Channel[];
  people: import('@/types').WorkspaceMember[];
}> {
  const { workspaces, channels } = useAppStore.getState();

  const matchedWorkspaces = workspaces.filter(w => fuzzyMatch(w.name, query));
  const matchedChannels = channels.filter(c => fuzzyMatch(c.name, query));

  // For people, search across all accessible workspaces
  const matchedPeople: import('@/types').WorkspaceMember[] = [];
  const uniqueWorkspaceIds = [...new Set(workspaces.map(w => w.id))];

  for (const wsId of uniqueWorkspaceIds) {
    const people = await findPeople(query, wsId);
    matchedPeople.push(...people);
  }

  // Deduplicate people by userId
  const seen = new Set<string>();
  const deduped = matchedPeople.filter(p => {
    if (seen.has(p.userId)) return false;
    seen.add(p.userId);
    return true;
  });

  return {
    workspaces: matchedWorkspaces,
    channels: matchedChannels,
    people: deduped,
  };
}

// --- Tool implementations for LLM-driven navigation ---

/**
 * Create a new workspace via Supabase.
 * Returns the created Workspace object so the caller (e.g., UI) can navigate to it.
 */
export async function createWorkspaceTool(params: {
  name?: string;
  icon?: string;
}): Promise<import('@/types').Workspace> {
  return createWorkspace(params);
}

/**
 * Create a new workspace via Supabase.
 * Alias for createWorkspaceTool that matches tool naming convention.
 */
export async function create_workspace(params: {
  workspace_name?: string;
}): Promise<import('@/types').Workspace> {
  return createWorkspace({ name: params.workspace_name });
}

// --- Workspace Management Tools ---

/**
 * Update an existing workspace.
 * Takes workspace_id and new_name/new_icon.
 * Returns the updated workspace.
 */
export async function update_workspace(params: {
  workspace_id: string;
  new_name?: string;
  new_icon?: string;
}): Promise<import('@/types').Workspace> {
  return supabaseUpdateWorkspace(params.workspace_id, {
    name: params.new_name,
    icon: params.new_icon,
  });
}

/**
 * Delete a workspace and all its associated data (cascades to channels, messages, etc).
 * Takes workspace_id.
 * Returns success confirmation.
 */
export async function delete_workspace(params: {
  workspace_id: string;
}): Promise<{ success: boolean; deleted_workspace_id: string }> {
  await supabaseDeleteWorkspace(params.workspace_id);
  return { success: true, deleted_workspace_id: params.workspace_id };
}

// --- Channel Management Tools ---

/**
 * Create a new channel in a workspace.
 * Takes workspace_id, channel_name, and channel_type (public/private).
 * Returns the newly created channel.
 */
export async function create_channel(params: {
  workspace_id: string;
  channel_name: string;
  channel_type?: 'public' | 'private';
}): Promise<import('@/types').Channel> {
  return supabaseCreateChannel(params.workspace_id, params.channel_name, params.channel_type ?? 'project');
}

/**
 * Update an existing channel's name or settings.
 * Takes channel_id and new_name and/or other updates.
 * Returns the updated channel.
 */
export async function update_channel(params: {
  channel_id: string;
  new_name?: string;
}): Promise<import('@/types').Channel> {
  if (!params.new_name) {
    throw new Error('new_name is required to update a channel');
  }
  return supabaseUpdateChannel(params.channel_id, params.new_name);
}

/**
 * Delete a channel from the workspace.
 * Takes channel_id.
 * Returns success confirmation.
 */
export async function delete_channel(params: {
  channel_id: string;
}): Promise<{ success: boolean; deleted_channel_id: string }> {
  await supabaseDeleteChannel(params.channel_id);
  return { success: true, deleted_channel_id: params.channel_id };
}

// --- DM Management Tools ---

/**
 * Delete a DM channel.
 * Takes channel_id (must be a DM channel).
 * Returns success confirmation.
 */
export async function delete_dm(params: {
  channel_id: string;
}): Promise<{ success: boolean; deleted_channel_id: string }> {
  await supabaseDeleteChannel(params.channel_id);
  return { success: true, deleted_channel_id: params.channel_id };
}

// --- Message Tools ---

/**
 * Send a message to a channel.
 * Takes channel_id and content.
 * Returns the created message.
 */
export async function send_message(params: {
  channel_id: string;
  content: string;
}): Promise<import('@/types').Message> {
  return supabaseInsertMessage(params.channel_id, 'user', params.content);
}

// --- Task Management Tools ---

/**
 * Create a new task in a workspace channel.
 * Takes workspace_id, channel_id, title, description, assignee_user_id, due_date.
 * Returns the created task.
 */
export async function create_task(params: {
  workspace_id: string;
  channel_id: string;
  title: string;
  description?: string;
  assignee_user_id?: string;
  due_date?: string; // ISO date string
}): Promise<Task> {
  // Resolve assignee display name if user_id provided
  let assignees: { displayName: string; userId?: string | null }[] = [];
  if (params.assignee_user_id) {
    const members = await fetchWorkspaceMemberProfiles(params.workspace_id);
    const member = members.find(m => m.userId === params.assignee_user_id);
    assignees = [{
      displayName: member?.displayName ?? params.assignee_user_id,
      userId: params.assignee_user_id,
    }];
  }

  return supabaseCreateTask({
    workspaceId: params.workspace_id,
    channelId: params.channel_id,
    title: params.title,
    description: params.description ?? null,
    dueDate: params.due_date ? new Date(params.due_date) : null,
    assignees,
  });
}

/**
 * Update an existing task.
 * Takes task_id and updates (status, title, description, assignee, due_date).
 * Returns the updated task.
 */
export async function update_task(params: {
  task_id: string;
  status?: TaskStatus;
  title?: string;
  description?: string;
  assignee_user_id?: string;
  due_date?: string | null;
}): Promise<Task> {
  const updates: {
    status?: TaskStatus;
    title?: string;
    description?: string;
    dueDate?: Date | null;
    assignees?: string[];
  } = {};

  if (params.status !== undefined) updates.status = params.status;
  if (params.title !== undefined) updates.title = params.title;
  if (params.description !== undefined) updates.description = params.description;
  if (params.due_date !== undefined) {
    updates.dueDate = params.due_date ? new Date(params.due_date) : null;
  }

  return supabaseUpdateTask(params.task_id, updates);
}

/**
 * List tasks in a workspace, optionally filtered by assignee.
 * Takes workspace_id and optional assignee_user_id.
 * Returns tasks from the workspace.
 */
export async function list_tasks(params: {
  workspace_id: string;
  assignee_user_id?: string;
}): Promise<Task[]> {
  const { workspaces } = useAppStore.getState();
  const workspaceChannels = useAppStore.getState().channels.filter(
    c => c.workspaceId === params.workspace_id
  );
  const channelIds = workspaceChannels.map(c => c.id);

  // Fetch tasks for all channels in the workspace
  const allTasks: Task[] = [];
  for (const channelId of channelIds) {
    const tasks = await supabaseFetchChannelTasks(channelId);
    allTasks.push(...tasks);
  }

  // Filter by assignee if provided
  if (params.assignee_user_id) {
    return allTasks.filter(task =>
      task.assignees.some(a => a.userId === params.assignee_user_id)
    );
  }

  return allTasks;
}

/**
 * Mark a task as complete.
 * Takes task_id.
 * Returns success confirmation.
 */
export async function complete_task(params: {
  task_id: string;
}): Promise<{ success: boolean; task_id: string }> {
  await supabaseUpdateTaskStatus(params.task_id, 'done');
  return { success: true, task_id: params.task_id };
}

// --- Semantic Search: Query Expansion ---
// Maps common search terms to related concepts for intelligent search.
// This allows "work" to match "job", "project", "task", etc.

const SEMANTIC_EXPANSION_MAP: Record<string, string[]> = {
  // General work terms
  work: ['work', 'job', 'project', 'task', 'deadline', 'meeting', 'office', 'career', 'assignment'],
  job: ['job', 'work', 'position', 'role', 'hiring', 'career', 'employment'],
  project: ['project', 'work', 'task', 'deliverable', 'milestone', 'deadline', 'collaboration'],
  task: ['task', 'todo', 'action item', 'assignment', 'deliverable', 'deadline', 'project'],
  deadline: ['deadline', 'due date', 'due', 'urgent', 'priority', 'overdue', 'timeline'],
  meeting: ['meeting', 'call', 'conference', 'sync', 'standup', 'discussion', 'agenda'],

  // Communication terms
  message: ['message', 'chat', 'conversation', 'post', 'reply', 'comment', 'note'],
  file: ['file', 'document', 'pdf', 'doc', 'attachment', 'upload', 'download'],

  // Team terms
  team: ['team', 'member', 'collaborator', 'coworker', 'colleague', 'group'],
  manager: ['manager', 'lead', 'director', 'supervisor', 'boss', 'head'],

  // Status terms
  update: ['update', 'progress', 'status', 'news', 'announcement', 'change'],
  done: ['done', 'completed', 'finished', 'closed', 'resolved', 'accomplished'],
  blocked: ['blocked', 'stuck', 'issue', 'problem', 'obstacle', 'waiting'],

  // Search terms
  search: ['search', 'find', 'lookup', 'query', 'filter', 'locate'],
};

/**
 * Expands a search query to include semantically related terms.
 * "work" -> ["work", "job", "project", "task", "deadline", "meeting"]
 */
export function expandQuerySemantically(query: string): string[] {
  const normalized = query.toLowerCase().trim();
  const terms: string[] = [normalized];

  // Check if we have semantic expansions for this term
  for (const [key, expansions] of Object.entries(SEMANTIC_EXPANSION_MAP)) {
    if (normalized === key || normalized.includes(key)) {
      terms.push(...expansions.filter(e => e !== normalized && !terms.includes(e)));
    }
  }

  // If no expansions found, add common variations
  if (terms.length === 1) {
    // Add the original term with common suffixes/prefixes
    const commonVariations = [
      normalized,
      normalized + 's',  // plural
      normalized + 'ing', // gerund
      normalized + 'ed',  // past tense
    ];
    terms.push(...commonVariations.filter(t => !terms.includes(t)));
  }

  return [...new Set(terms)]; // deduplicate
}

/**
 * Interprets a search query and returns a human-readable explanation
 * of what the search is looking for.
 */
export function interpretSearchQuery(query: string): string {
  const normalized = query.toLowerCase().trim();

  const interpretations: Array<{ pattern: RegExp | string; message: string }> = [
    { pattern: /^work$/i, message: "looking for work-related activity, jobs, projects, tasks, and meetings" },
    { pattern: /^project/i, message: "looking for project-related content, tasks, deadlines, and team collaboration" },
    { pattern: /^task/i, message: "looking for tasks, action items, and to-do entries" },
    { pattern: /^meeting/i, message: "looking for meeting notes, discussions, and team syncs" },
    { pattern: /^deadline/i, message: "looking for upcoming deadlines, due dates, and urgent items" },
    { pattern: /^file/i, message: "looking for files, documents, and attachments" },
    { pattern: /^team/i, message: "looking for team members, collaborators, and colleagues" },
    { pattern: /^message/i, message: "looking for messages, conversations, and chats" },
  ];

  for (const { pattern, message } of interpretations) {
    if (typeof pattern === 'string' ? normalized === pattern : pattern.test(normalized)) {
      return message;
    }
  }

  return `searching for "${query}" and related content`;
}

// --- Message search result type ---
export interface MessageSearchResult {
  id: string;
  content: string;
  created_at: string;
  sender_name: string | null;
  sender_avatar: string | null;
  workspace_name: string;
  workspace_id: string;
  channel_name: string;
  channel_id: string;
}

// --- Semantic search result type ---
export interface SemanticSearchResult {
  interpretation: string;
  expandedTerms: string[];
  messages: MessageSearchResult[];
  channels: Array<{ id: string; name: string; workspaceName: string; workspaceId: string }>;
  workspaces: Array<{ id: string; name: string }>;
}

/**
 * Find messages matching a query across Supabase.
 *
 * - Queries the `messages` table with a full-text or ilike search on content.
 * - Joins `threads` → `channels` → `workspaces` for context.
 * - Left-joins `profiles` (or `users` auth table) for sender name/avatar.
 * - When workspaceId is provided, searches only that workspace.
 * - When workspaceId is NOT provided, searches ALL workspaces the user has access to (from useAppStore).
 * - Returns up to 50 results, ordered by most recent first.
 *
 * Edge cases:
 * - If Supabase is not configured, returns an empty array.
 * - If no messages match, returns an empty array.
 */
export async function findMessages(
  query: string,
  workspaceId?: string
): Promise<MessageSearchResult[]> {
  // Fallback if Supabase env vars are missing
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return [];
  }

  const supabase = getSupabase();

  // If no specific workspaceId, scope to all user's workspaces from useAppStore
  const { workspaces } = useAppStore.getState();
  const workspaceIds = workspaceId
    ? [workspaceId]
    : workspaces.map(w => w.id);

  // Build the base query: messages + threads + channels + workspaces
  let dbQuery = supabase
    .from('messages')
    .select(`
      id,
      content,
      created_at,
      user_id,
      user_display_name,
      thread_id,
      threads!inner (
        channel_id,
        channels!inner (
          workspace_id,
          name,
          workspaces!inner (
            id,
            name
          )
        )
      )
    `)
    .ilike('messages.content', `%${query}%`)
    .order('messages.created_at', { ascending: false })
    .limit(50);

  // Filter by workspace(s) when provided
  if (workspaceId) {
    dbQuery = dbQuery.eq('threads.channels.workspace_id', workspaceId);
  } else if (workspaceIds.length > 0) {
    dbQuery = dbQuery.in('threads.channels.workspace_id', workspaceIds);
  }

  const { data, error } = await dbQuery;
  if (error || !data || data.length === 0) return [];

  // Collect all user_ids to fetch profiles in one shot
  const userIds = [...new Set(
    data
      .map((m: Record<string, unknown>) => (m as { user_id?: string }).user_id)
      .filter((id): id is string => Boolean(id))
  )];

  let profileRows: Array<{ id: string; avatar_url?: string }> = [];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, avatar_url')
      .in('id', userIds);
    profileRows = (profiles ?? []) as typeof profileRows;
  }

  const avatarByUserId = new Map<string, string | null>(
    profileRows.map(p => [p.id, p.avatar_url ?? null])
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((row: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thread = row.threads as any;
    const channel = thread?.channels;
    const workspace = channel?.workspaces;

    return {
      id: row.id,
      content: row.content,
      created_at: row.created_at,
      sender_name: row.user_display_name ?? null,
      sender_avatar: avatarByUserId.get(row.user_id ?? '') ?? null,
      workspace_name: workspace?.name ?? 'Unknown Workspace',
      workspace_id: workspace?.id ?? '',
      channel_name: channel?.name ?? 'Unknown Channel',
      channel_id: channel?.id ?? '',
    } satisfies MessageSearchResult;
  });
}

/**
 * Perform semantic search across all content types.
 *
 * This function:
 * 1. Interprets the search query to understand user intent
 * 2. Expands the query with semantically related terms
 * 3. Searches messages, channels, and workspaces with the expanded terms
 * 4. Returns results with proper context and explanation
 *
 * Unlike findMessages which does exact keyword matching, semanticSearch
 * understands that "work" might relate to "job", "project", "task", etc.
 */
export async function semanticSearch(
  query: string,
  workspaceId?: string
): Promise<SemanticSearchResult> {
  const { workspaces, channels } = useAppStore.getState();

  // Step 1: Interpret what the user is looking for
  const interpretation = interpretSearchQuery(query);

  // Step 2: Expand the query with semantically related terms
  const expandedTerms = expandQuerySemantically(query);

  // Step 3: Search messages using OR across expanded terms
  const allMessages: MessageSearchResult[] = [];

  // Search with each expanded term and deduplicate by message ID
  for (const term of expandedTerms.slice(0, 5)) { // Limit to 5 terms to avoid overwhelming the query
    try {
      const messages = await findMessages(term, workspaceId);
      for (const msg of messages) {
        if (!allMessages.some(m => m.id === msg.id)) {
          allMessages.push(msg);
        }
      }
    } catch {
      // Continue with other terms if one fails
    }
  }

  // Sort by most recent
  allMessages.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Step 4: Search workspaces and channels by name using fuzzy match
  const expandedQuery = expandedTerms.join(' ');
  const matchedWorkspaces = workspaces
    .filter(w => fuzzyMatch(w.name, query) || fuzzyMatch(w.name, expandedQuery))
    .map(w => ({ id: w.id, name: w.name }));

  const targetChannels = workspaceId
    ? channels.filter(c => c.workspaceId === workspaceId)
    : channels;

  const matchedChannels = targetChannels
    .filter(c => fuzzyMatch(c.name, query) || fuzzyMatch(c.name, expandedQuery))
    .map(c => {
      const ws = workspaces.find(w => w.id === c.workspaceId);
      return {
        id: c.id,
        name: c.name,
        workspaceName: ws?.name ?? 'Unknown',
        workspaceId: c.workspaceId,
      };
    });

  return {
    interpretation,
    expandedTerms,
    messages: allMessages.slice(0, 50), // Limit total messages
    channels: matchedChannels.slice(0, 20),
    workspaces: matchedWorkspaces.slice(0, 10),
  };
}