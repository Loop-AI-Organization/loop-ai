/**
 * Supabase data layer: workspaces, channels, threads, messages.
 * All queries run with the current user's session; RLS enforces per-user access.
 */
import { getSupabase, getAuthHeaders } from '@/lib/supabase';
import type {
  Workspace,
  Channel,
  Thread,
  Message,
  WorkspaceMember,
  FileRecord,
  Task,
  TaskAssignee,
  TaskStatus,
} from '@/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'https://api.loopai-project.me';

// --- DB row types (snake_case) ---
interface WorkspaceRow {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  created_at: string;
}

interface ChannelRow {
  id: string;
  workspace_id: string;
  name: string;
  type: 'project' | 'dm';
  is_llm_restricted: boolean;
  llm_participation_enabled: boolean;
  created_at: string;
}

interface ThreadRow {
  id: string;
  workspace_id: string | null;
  channel_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  user_id?: string | null;
  user_display_name?: string | null;
  created_at: string;
}

function toWorkspace(r: WorkspaceRow): Workspace {
  return { id: r.id, name: r.name, icon: r.icon, ownerId: r.user_id };
}

function toChannel(r: ChannelRow): Channel {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    type: r.type,
    isLlmRestricted: r.is_llm_restricted ?? false,
    llmParticipationEnabled: r.llm_participation_enabled ?? true,
    unreadCount: 0,
    lastMessage: undefined,
  };
}

function toThread(r: ThreadRow): Thread {
  return {
    id: r.id,
    channelId: r.channel_id ?? '',
    title: r.title ?? 'Untitled',
    updatedAt: new Date(r.updated_at),
    messageCount: 0, // can be set separately if we add a count query
  };
}

function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    threadId: r.thread_id,
    role: r.role as 'user' | 'assistant' | 'system' | 'tool',
    content: r.content,
    createdAt: new Date(r.created_at),
    userId: r.user_id ?? null,
    userDisplayName: r.user_display_name ?? null,
  };
}

/**
 * Update the current user's profile display name in Supabase Auth user_metadata.
 */
export async function updateAccountProfile(displayName: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.updateUser({ data: { full_name: displayName } });
  if (error) throw error;
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, user_id, name, icon, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as WorkspaceRow[]).map(toWorkspace);
}

export async function createWorkspace(params: { name?: string; icon?: string }): Promise<Workspace> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      user_id: user.id,
      name: params.name ?? 'My Workspace',
      icon: params.icon ?? '◎',
    })
    .select('id, user_id, name, icon, created_at')
    .single();
  if (error) throw error;
  const workspace = toWorkspace(data as WorkspaceRow);
  // Best-effort: add owner row to workspace_members. The workspace is already
  // owned via user_id, so a failure here is non-fatal.
  try {
    await supabase
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' });
  } catch {
    // Ignore — RLS or duplicate constraint; user still owns the workspace.
  }
  return workspace;
}

export async function updateWorkspace(
  workspaceId: string,
  params: { name?: string; icon?: string }
): Promise<Workspace> {
  const supabase = getSupabase();
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.icon !== undefined) updates.icon = params.icon;
  if (Object.keys(updates).length === 0) {
    const { data } = await supabase
      .from('workspaces')
      .select('id, user_id, name, icon, created_at')
      .eq('id', workspaceId)
      .single();
    if (!data) throw new Error('Workspace not found');
    return toWorkspace(data as WorkspaceRow);
  }
  const { data, error } = await supabase
    .from('workspaces')
    .update(updates)
    .eq('id', workspaceId)
    .select('id, user_id, name, icon, created_at')
    .single();
  if (error) throw error;
  return toWorkspace(data as WorkspaceRow);
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId);
  if (error) throw error;
}

export async function fetchChannels(workspaceId: string): Promise<Channel[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('channels')
    .select('id, workspace_id, name, type, is_llm_restricted, llm_participation_enabled, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ChannelRow[]).map(toChannel);
}

// --- Workspace members ---
interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

function toWorkspaceMember(r: WorkspaceMemberRow): WorkspaceMember {
  return {
    id: r.id,
    userId: r.user_id,
    role: r.role as 'owner' | 'member',
  };
}

export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, user_id, role, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as WorkspaceMemberRow[]).map(toWorkspaceMember);
}

/** Add a member by user ID (e.g. after resolving email via backend). */
export async function addWorkspaceMemberByUserId(workspaceId: string, userId: string): Promise<WorkspaceMember> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: userId, role: 'member' })
    .select('id, workspace_id, user_id, role, created_at')
    .single();
  if (error) throw error;
  return toWorkspaceMember(data as WorkspaceMemberRow);
}

/** Invite a user to the workspace by email. Existing users are added; new users get an invite email. */
export async function addWorkspaceMemberByEmail(
  workspaceId: string,
  email: string
): Promise<{ userId?: string; invited?: boolean; message?: string }> {
  const headers = await getAuthHeaders();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/members/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: email.trim() }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/fetch|network|failed to fetch/i.test(msg)) {
      throw new Error('Could not reach the server. Is the backend running? Check VITE_API_URL.');
    }
    throw e;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Invite failed (${res.status})`);
  }
  return {
    userId: body.user_id,
    invited: body.invited === true,
    message: body.message,
  };
}

/** Call after sign-up when user lands with ?workspace_id=...&invited=1 to join the workspace. */
export async function acceptWorkspaceInvite(workspaceId: string): Promise<{ alreadyMember: boolean }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/workspaces/accept-invite`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? body.message ?? `Accept invite failed (${res.status})`);
  }
  const data = await res.json();
  return { alreadyMember: data.already_member === true };
}

/** Get or create the current workspace's share code. */
export async function getWorkspaceShareCode(workspaceId: string): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/share-code`, {
    method: 'POST',
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Failed to get share code (${res.status})`);
  }
  return body.share_code as string;
}

/** Rotate the workspace's share code and return the new value. */
export async function rotateWorkspaceShareCode(workspaceId: string): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/share-code/rotate`, {
    method: 'POST',
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Failed to rotate share code (${res.status})`);
  }
  return body.share_code as string;
}

/** Join a workspace using its share code. */
export async function joinWorkspaceByCode(
  code: string
): Promise<{ workspaceId: string; alreadyMember: boolean; workspace: Workspace }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/workspaces/join-by-code`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Join by code failed (${res.status})`);
  }
  const workspace: Workspace = {
    id: body.workspace_id as string,
    name: (body.workspace_name as string) ?? 'Workspace',
    icon: (body.workspace_icon as string) ?? '◎',
    ownerId: (body.workspace_owner_id as string) ?? '',
  };
  return {
    workspaceId: body.workspace_id as string,
    alreadyMember: body.already_member === true,
    workspace,
  };
}

/** Fetch workspace members with profile info (email + display name) via backend. */
export async function fetchWorkspaceMemberProfiles(workspaceId: string): Promise<WorkspaceMember[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/members`, {
    method: 'GET',
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Failed to load members (${res.status})`);
  }
  const list = (body as Array<{ id: string; user_id: string; role: string; email: string; display_name: string }>) ?? [];
  return list.map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role as 'owner' | 'member',
    email: m.email,
    displayName: m.display_name,
  }));
}

/** Remove a member from a workspace (owner only). */
export async function removeWorkspaceMember(workspaceId: string, memberId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/members/remove`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ member_id: memberId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Failed to remove member (${res.status})`);
  }
}

/** Find an existing 1:1 DM channel between current user and otherUserId in this workspace. */
export async function findExistingDm(workspaceId: string, otherUserId: string): Promise<Channel | null> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: myChannels } = await supabase
    .from('channel_members')
    .select('channel_id')
    .eq('user_id', user.id);
  const myChannelIds = (myChannels ?? []).map((r: { channel_id: string }) => r.channel_id);
  if (myChannelIds.length === 0) return null;
  const { data: channels } = await supabase
    .from('channels')
    .select('id, workspace_id, name, type, is_llm_restricted, llm_participation_enabled, created_at')
    .eq('workspace_id', workspaceId)
    .eq('type', 'dm')
    .in('id', myChannelIds);
  if (!channels || channels.length === 0) return null;
  for (const ch of channels as ChannelRow[]) {
    const { data: members } = await supabase
      .from('channel_members')
      .select('user_id')
      .eq('channel_id', ch.id);
    const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    if (userIds.length === 2 && userIds.includes(user.id) && userIds.includes(otherUserId))
      return toChannel(ch);
  }
  return null;
}

/** Create a DM channel with the other user and add both to channel_members. */
export async function createDmChannel(workspaceId: string, otherUserId: string): Promise<Channel> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/dms`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ other_user_id: otherUserId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Failed to create DM (${res.status})`);
  }
  return toChannel(body as ChannelRow);
}

export async function createChannel(workspaceId: string, name: string, type: 'project' | 'dm' = 'project'): Promise<Channel> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('channels')
    .insert({ workspace_id: workspaceId, name, type })
    .select('id, workspace_id, name, type, is_llm_restricted, llm_participation_enabled, created_at')
    .single();
  if (error) throw error;
  return toChannel(data as ChannelRow);
}

export async function fetchThreads(channelId: string): Promise<Thread[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('threads')
    .select('id, workspace_id, channel_id, title, created_at, updated_at')
    .eq('channel_id', channelId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as ThreadRow[]).map(toThread);
}

/** Compatibility helper: resolve most recent thread for a channel or create one. */
async function getOrCreateChannelThreadId(channelId: string): Promise<string> {
  const supabase = getSupabase();
  const { data: existing, error: existingError } = await supabase
    .from('threads')
    .select('id, updated_at')
    .eq('channel_id', channelId)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (existingError) throw existingError;
  const existingId = (existing as Array<{ id: string }> | null)?.[0]?.id;
  if (existingId) return existingId;

  const { data: channelRow, error: channelError } = await supabase
    .from('channels')
    .select('workspace_id')
    .eq('id', channelId)
    .single();
  if (channelError) throw channelError;

  const { data: created, error: createError } = await supabase
    .from('threads')
    .insert({
      workspace_id: (channelRow as { workspace_id: string }).workspace_id,
      channel_id: channelId,
      title: 'Channel conversation',
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (createError) throw createError;
  return (created as { id: string }).id;
}

export async function createThread(workspaceId: string, channelId: string, title: string = 'Untitled'): Promise<Thread> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('threads')
    .insert({
      workspace_id: workspaceId,
      channel_id: channelId,
      title,
      updated_at: new Date().toISOString(),
    })
    .select('id, workspace_id, channel_id, title, created_at, updated_at')
    .single();
  if (error) throw error;
  return toThread(data as ThreadRow);
}

export async function updateThreadTitle(threadId: string, title: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('threads')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', threadId);
  if (error) throw error;
}

export async function fetchMessages(channelId: string): Promise<Message[]> {
  const supabase = getSupabase();
  const threadId = await getOrCreateChannelThreadId(channelId);
  const { data, error } = await supabase
    .from('messages')
    .select('id, thread_id, role, content, user_id, user_display_name, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as MessageRow[]).map(toMessage);
}

export async function deleteMessage(messageId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);
  if (error) throw error;
}

export async function updateChannel(channelId: string, name: string): Promise<Channel> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('channels')
    .update({ name })
    .eq('id', channelId)
    .select('id, workspace_id, name, type, is_llm_restricted, llm_participation_enabled, created_at')
    .single();
  if (error) throw error;
  return toChannel(data as ChannelRow);
}

export async function updateChannelSettings(
  channelId: string,
  settings: { isLlmRestricted?: boolean; llmParticipationEnabled?: boolean }
): Promise<Channel> {
  const headers = await getAuthHeaders();
  const payload: Record<string, boolean> = {};
  if (settings.isLlmRestricted !== undefined) payload.is_llm_restricted = settings.isLlmRestricted;
  if (settings.llmParticipationEnabled !== undefined) {
    payload.llm_participation_enabled = settings.llmParticipationEnabled;
  }
  const res = await fetch(`${API_URL}/api/channels/${channelId}/settings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Failed to update channel settings (${res.status})`);
  }
  return toChannel(body as ChannelRow);
}

export async function refreshChannelSummary(channelId: string): Promise<{ ok: boolean; queued: boolean }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/channels/${channelId}/summary/refresh`, {
    method: 'POST',
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail ?? body.message ?? `Failed to refresh channel summary (${res.status})`);
  }
  return {
    ok: body.ok === true,
    queued: body.queued === true,
  };
}

export async function deleteChannel(channelId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('channels')
    .delete()
    .eq('id', channelId);
  if (error) throw error;
}

export async function insertMessage(channelId: string, role: Message['role'], content: string): Promise<Message> {
  const supabase = getSupabase();
  const threadId = await getOrCreateChannelThreadId(channelId);
  const { data: { user } } = await supabase.auth.getUser();
  const isUser = role === 'user';
  const userId = isUser ? (user?.id ?? null) : null;
  const userDisplayName = isUser
    ? (user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? null)
    : null;
  const { data, error } = await supabase
    .from('messages')
    .insert({
      thread_id: threadId,
      role,
      content,
      ...(isUser ? { user_id: userId, user_display_name: userDisplayName } : {}),
    })
    .select('id, thread_id, role, content, user_id, user_display_name, created_at')
    .single();
  if (error) throw error;
  if (role === 'user') {
    refreshChannelSummary(channelId).catch(() => undefined);
  }
  return toMessage(data as MessageRow);
}

// --- Files ---
interface FileRow {
  id: string;
  workspace_id: string;
  source: 'upload' | 'generated';
  storage_path: string;
  file_name: string;
  file_size: number;
  content_type: string | null;
  created_by: string | null;
  created_at: string;
  summary: string | null;
  project_context: string | null;
  tags: string[] | null;
  metadata_status: 'pending' | 'ready' | 'failed';
  source_channel_id: string | null;
}

function toFileRecord(r: FileRow): FileRecord {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    source: r.source,
    storagePath: r.storage_path,
    fileName: r.file_name,
    fileSize: Number(r.file_size),
    contentType: r.content_type,
    createdBy: r.created_by,
    createdAt: new Date(r.created_at),
    summary: r.summary,
    projectContext: r.project_context,
    tags: r.tags,
    metadataStatus: r.metadata_status,
    sourceChannelId: r.source_channel_id,
  };
}

export async function fetchWorkspaceFiles(workspaceId: string): Promise<FileRecord[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as FileRow[]).map(toFileRecord);
}

export async function uploadFile(
  workspaceId: string,
  channelId: string | null,
  file: File
): Promise<FileRecord> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/files/upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      workspace_id: workspaceId,
      channel_id: channelId,
      file_name: file.name,
      content_type: file.type || 'application/octet-stream',
      file_size: file.size,
    }),
  });
  if (!res.ok) throw new Error('Failed to initiate upload');
  const payload = await res.json();
  const uploadUrl: string = payload.signed_upload_url;
  const fileId: string = payload.file_id;

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!putRes.ok) throw new Error('Upload failed');

  // Fetch the created file record
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single();
  if (error) throw error;
  return toFileRecord(data as FileRow);
}

export async function getFileDownloadUrl(fileId: string): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/files/${fileId}/download`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) throw new Error('Failed to get download URL');
  const body = await res.json();
  return body.url as string;
}

export async function ensureDefaultWorkspaceAndChannel(): Promise<{ workspace: Workspace; channel: Channel }> {
  const workspaces = await fetchWorkspaces();
  if (workspaces.length > 0) {
    const channels = await fetchChannels(workspaces[0].id);
    if (channels.length > 0) {
      return { workspace: workspaces[0], channel: channels[0] };
    }
    const channel = await createChannel(workspaces[0].id, 'general');
    return { workspace: workspaces[0], channel };
  }
  const workspace = await createWorkspace({ name: 'My Workspace' });
  const channel = await createChannel(workspace.id, 'general');
  return { workspace, channel };
}

// --- AI triage & auto-response for group chat ---

export interface NavigationResult {
  channelId: string;
  workspaceId: string;
  channelName?: string;
  workspaceName?: string;
  confidence?: 'high' | 'medium' | 'low';
  reason?: string;
}

export interface TriageResult {
  shouldRespond: boolean;
  messageId?: string;
  content?: string;
  reason?: string;
  navigation?: NavigationResult;
  files?: FileRecord[];
}

/**
 * Call the backend triage endpoint: lightweight AI decides if the assistant should
 * respond, and if so generates a GPT-4o reply saved directly to the thread.
 */
export async function triageAndRespond(
  channelId: string,
  messages: Array<{ role: string; content: string }>
): Promise<TriageResult> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/channels/${channelId}/triage`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ channel_id: channelId, messages }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? body.message ?? `Triage failed (${res.status})`);
  }
  const data = await res.json();
  const nav = data.navigation;
  return {
    shouldRespond: data.should_respond === true,
    messageId: data.message_id,
    content: data.content,
    reason: data.reason,
    navigation: nav
      ? {
          channelId: nav.channel_id,
          workspaceId: nav.workspace_id,
          channelName: nav.channel_name,
          workspaceName: nav.workspace_name,
          confidence: nav.confidence,
          reason: nav.reason,
        }
      : undefined,
    files: data.files?.map((f: FileRow) => toFileRecord(f)),
  };
}

// --- Tasks ---

interface TaskRow {
  id: string;
  workspace_id: string;
  channel_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  source_message_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskAssigneeRow {
  task_id: string;
  display_name: string;
  user_id: string | null;
  added_by: string | null;
  added_at: string;
}

function toTaskAssignee(r: TaskAssigneeRow): TaskAssignee {
  return {
    taskId: r.task_id,
    displayName: r.display_name,
    userId: r.user_id,
    addedBy: r.added_by,
    addedAt: new Date(r.added_at),
  };
}

function toTask(r: TaskRow, assignees: TaskAssigneeRow[] = []): Task {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    channelId: r.channel_id,
    title: r.title,
    description: r.description,
    status: r.status,
    dueDate: r.due_date ? new Date(r.due_date) : null,
    sourceMessageId: r.source_message_id,
    createdBy: r.created_by,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    assignees: assignees.map(toTaskAssignee),
  };
}

export async function fetchChannelTasks(channelId: string): Promise<Task[]> {
  const supabase = getSupabase();
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (tasks ?? []) as TaskRow[];
  if (rows.length === 0) return [];

  const { data: assignees, error: aErr } = await supabase
    .from('task_assignees')
    .select('*')
    .in('task_id', rows.map((r) => r.id));
  if (aErr) throw aErr;
  const aRows = (assignees ?? []) as TaskAssigneeRow[];
  const byTask = new Map<string, TaskAssigneeRow[]>();
  for (const a of aRows) {
    const list = byTask.get(a.task_id) ?? [];
    list.push(a);
    byTask.set(a.task_id, list);
  }
  return rows.map((r) => toTask(r, byTask.get(r.id) ?? []));
}

export async function createTask(input: {
  workspaceId: string;
  channelId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  dueDate?: Date | null;
  sourceMessageId?: string | null;
  assignees?: { displayName: string; userId?: string | null }[];
}): Promise<Task> {
  const supabase = getSupabase();
  const { data: row, error } = await supabase
    .from('tasks')
    .insert({
      workspace_id: input.workspaceId,
      channel_id: input.channelId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'proposed',
      due_date: input.dueDate ? input.dueDate.toISOString() : null,
      source_message_id: input.sourceMessageId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  const taskRow = row as TaskRow;

  let assignees: TaskAssigneeRow[] = [];
  if (input.assignees && input.assignees.length > 0) {
    const { data: aRows, error: aErr } = await supabase
      .from('task_assignees')
      .insert(
        input.assignees.map((a) => ({
          task_id: taskRow.id,
          display_name: a.displayName,
          user_id: a.userId ?? null,
        }))
      )
      .select('*');
    if (aErr) throw aErr;
    assignees = (aRows ?? []) as TaskAssigneeRow[];
  }
  return toTask(taskRow, assignees);
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
  if (error) throw error;
}

export async function confirmTask(taskId: string): Promise<void> {
  // Promotes a proposed task to open. Anyone in the workspace may do this.
  return updateTaskStatus(taskId, 'open');
}

export async function rejectTask(taskId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
}

export async function addTaskAssignee(
  taskId: string,
  displayName: string,
  userId?: string | null
): Promise<TaskAssignee> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('task_assignees')
    .insert({ task_id: taskId, display_name: displayName, user_id: userId ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return toTaskAssignee(data as TaskAssigneeRow);
}

export async function removeTaskAssignee(taskId: string, displayName: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('task_assignees')
    .delete()
    .eq('task_id', taskId)
    .eq('display_name', displayName);
  if (error) throw error;
}

// --- Task API routes (backed by backend, not direct Supabase) ---

export async function confirmTaskViaApi(taskId: string): Promise<Task> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/tasks/${taskId}/confirm`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) throw new Error(`Failed to confirm task (${res.status})`);
  const body = await res.json();
  const r = body.task as TaskRow & { task_assignees?: TaskAssigneeRow[] };
  return toTask(r, r.task_assignees ?? []);
}

export async function deleteTaskViaApi(taskId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`Failed to delete task (${res.status})`);
}

export async function updateTaskViaApi(
  taskId: string,
  updates: {
    status?: TaskStatus;
    title?: string;
    description?: string;
    dueDate?: Date | null;
    assignees?: string[];
  }
): Promise<Task> {
  const headers = await getAuthHeaders();
  const payload: Record<string, unknown> = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.dueDate !== undefined) payload.due_date = updates.dueDate ? updates.dueDate.toISOString() : null;
  if (updates.assignees !== undefined) payload.assignees = updates.assignees;

  const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update task (${res.status})`);
  const body = await res.json();
  const r = body.task as TaskRow & { task_assignees?: TaskAssigneeRow[] };
  return toTask(r, r.task_assignees ?? []);
}

/**
 * Client-side: given a typed name string and a list of workspace members,
 * return the best-matching member (or null if no confident match).
 * Used for the "add assignee" input in the TaskCard UI.
 */
export function matchMemberByName(
  name: string,
  members: WorkspaceMember[]
): WorkspaceMember | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  let best: WorkspaceMember | null = null;
  let bestScore = 0;

  for (const m of members) {
    const haystack = (m.displayName ?? '').toLowerCase();
    const parts = haystack.split(/\s+/);
    let score = 0;
    if (needle === haystack) score = 100;
    else if (needle === parts[0]) score = 80;
    else if (parts.length > 1 && needle === parts[parts.length - 1]) score = 70;
    else if (haystack.includes(needle) || needle.includes(haystack)) score = 50;

    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  return bestScore >= 50 ? best : null;
}
