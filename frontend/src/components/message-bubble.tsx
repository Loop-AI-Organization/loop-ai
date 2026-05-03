import { cn } from '@/lib/utils';
import type { FileRecord, Message, Task, TaskAssignee } from '@/types';
import { FileCard } from '@/components/file-card';
import { TaskCard } from '@/components/task-card';
import { ClarifyCard } from '@/components/clarify-card';
import { User, Bot, Trash2 } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { getSupabase } from '@/lib/supabase';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const currentUser = useAppStore((s) => s.user);
  const isSelf =
    isUser &&
    !!message.userId &&
    !!currentUser?.id &&
    message.userId === currentUser.id;
  const side: 'left' | 'right' = isAssistant ? 'left' : isSelf ? 'right' : 'left';
  const senderLabel = isAssistant
    ? 'Loop AI'
    : isSelf
      ? 'You'
      : message.userDisplayName || 'Member';
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [message.content, isStreaming]);

  const handleDelete = async () => {
    if (!isSelf) return;
    try {
      const { deleteMessage } = await import('@/lib/supabase-data');
      await deleteMessage(message.id);
      useAppStore.setState((s) => ({
        messages: s.messages.filter((m) => m.id !== message.id),
      }));
    } catch (e) {
      console.error('Failed to delete message:', e);
    }
  };

  return (
    <div
      className={cn(
        'flex px-4 py-3 group relative transition-colors hover:bg-muted/50',
        side === 'right' ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'flex gap-3 max-w-[85%] min-w-0 items-start',
          side === 'right' && 'flex-row-reverse'
        )}
      >
        {/* Avatar */}
        <div className="flex flex-col items-center gap-1">
          <div
            className={cn(
              'w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center',
              isAssistant ? 'bg-primary' : isSelf ? 'bg-primary' : 'bg-secondary'
            )}
          >
            {isAssistant ? (
              <Bot className="w-4 h-4 text-primary-foreground" />
            ) : (
              <User className={cn('w-4 h-4', isSelf ? 'text-primary-foreground' : 'text-secondary-foreground')} />
            )}
          </div>
        </div>

        {isSelf && !isStreaming && (
          <div className="flex items-center self-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleDelete}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              title="Delete message"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className={cn('min-w-0 space-y-1', side === 'right' && 'items-end text-right')}>
          {/* Header */}
          <div className={cn('flex items-center gap-2', side === 'right' && 'justify-end')}>
            <span className="font-medium text-sm">{senderLabel}</span>
            <span className="text-2xs text-muted-foreground">{formatTime(message.createdAt)}</span>
            {isStreaming && (
              <span className="inline-flex items-center gap-1 text-2xs text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-subtle" />
                Streaming
              </span>
            )}
          </div>

          {/* Bubble */}
          <div
            ref={contentRef}
            className={cn(
              'rounded-xl px-3 py-2 border',
              isAssistant
                ? 'bg-muted border-border'
                : isSelf
                  ? 'bg-primary text-primary-foreground border-primary/30'
                  : 'bg-secondary border-border'
            )}
          >
            <div
              className={cn(
                'prose prose-sm max-w-none',
                isSelf
                  ? 'text-primary-foreground prose-headings:text-primary-foreground prose-strong:text-primary-foreground prose-code:text-primary-foreground prose-pre:border-primary/30 prose-pre:bg-primary/10'
                  : 'text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-code:bg-muted prose-pre:bg-surface-sunken prose-pre:border prose-pre:border-border'
              )}
            >
              <MessageContent content={message.content} files={message.files} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Matches :::file{id="..."}, :::task{id="..."}, and :::clarify{key="value" ...}
const MARKER_RE = /:::(file|task)\{id="([^"]+)"\}|:::(clarify)\{([^}]+)\}/g;

type Segment =
  | { type: 'text'; text: string }
  | { type: 'file'; id: string }
  | { type: 'task'; id: string }
  | { type: 'clarify'; attrs: Record<string, string> };

function parseClarifyAttrs(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) result[m[1]] = m[2];
  return result;
}

function parseMarkers(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MARKER_RE.lastIndex = 0;

  while ((match = MARKER_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }
    if (match[3] === 'clarify') {
      segments.push({ type: 'clarify', attrs: parseClarifyAttrs(match[4]) });
    } else {
      segments.push({ type: match[1] as 'file' | 'task', id: match[2] });
    }
    lastIndex = MARKER_RE.lastIndex;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', text: content.slice(lastIndex) });
  }
  return segments;
}

function MessageContent({ content, files }: { content: string; files?: FileRecord[] }) {
  const segments = parseMarkers(content);
  const fileIds = segments.filter((s): s is { type: 'file'; id: string } => s.type === 'file').map((s) => s.id);
  const taskIds = segments.filter((s): s is { type: 'task'; id: string } => s.type === 'task').map((s) => s.id);
  const clarifySegments = segments.filter((s): s is { type: 'clarify'; attrs: Record<string, string> } => s.type === 'clarify');

  const storeTasks = useAppStore((s) => s.tasks);
  const upsertTask = useAppStore((s) => s.upsertTask);

  const [resolvedFiles, setResolvedFiles] = useState<Map<string, FileRecord>>(
    () => new Map((files || []).map((f) => [f.id, f]))
  );
  const [resolvedTasks, setResolvedTasks] = useState<Map<string, Task>>(() => {
    const m = new Map<string, Task>();
    for (const t of storeTasks) {
      if (taskIds.includes(t.id)) m.set(t.id, t);
    }
    return m;
  });

  // Sync store task updates into local resolved map
  useEffect(() => {
    if (taskIds.length === 0) return;
    setResolvedTasks((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const t of storeTasks) {
        if (taskIds.includes(t.id)) {
          next.set(t.id, t);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [storeTasks]);

  useEffect(() => {
    if (fileIds.length === 0) return;
    const missing = fileIds.filter((id) => !resolvedFiles.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    const supabase = getSupabase();
    supabase
      .from('files')
      .select('*')
      .in('id', missing)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setResolvedFiles((prev) => {
          const next = new Map(prev);
          for (const r of data) {
            next.set(r.id, {
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
            });
          }
          return next;
        });
      });
    return () => { cancelled = true; };
  }, [content]);

  useEffect(() => {
    if (taskIds.length === 0) return;
    const missing = taskIds.filter((id) => !resolvedTasks.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    const supabase = getSupabase();
    supabase
      .from('tasks')
      .select('*, task_assignees(task_id, display_name, user_id, added_by, added_at)')
      .in('id', missing)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setResolvedTasks((prev) => {
          const next = new Map(prev);
          for (const r of data) {
            const task: Task = {
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
              assignees: (r.task_assignees ?? []).map((a: TaskAssignee & { task_id: string; added_at: string }) => ({
                taskId: a.task_id ?? r.id,
                displayName: a.displayName ?? (a as unknown as Record<string, string>).display_name,
                userId: a.userId ?? (a as unknown as Record<string, string | null>).user_id,
                addedBy: a.addedBy ?? (a as unknown as Record<string, string | null>).added_by,
                addedAt: new Date((a as unknown as Record<string, string>).added_at ?? Date.now()),
              })),
            };
            next.set(r.id, task);
            upsertTask(task);
          }
          return next;
        });
      });
    return () => { cancelled = true; };
  }, [content]);

  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.type === 'file') {
          const fileRecord = resolvedFiles.get(seg.id);
          if (fileRecord) return <FileCard key={`file-${idx}`} file={fileRecord} />;
          return null;
        }
        if (seg.type === 'task') {
          const task = resolvedTasks.get(seg.id);
          if (task) return <TaskCard key={`task-${idx}`} task={task} />;
          return null;
        }
        if (seg.type === 'clarify') {
          const { a_label, a_query, b_label, b_query } = seg.attrs;
          if (a_label && a_query && b_label && b_query) {
            return (
              <ClarifyCard
                key={`clarify-${idx}`}
                aLabel={a_label}
                aQuery={a_query}
                bLabel={b_label}
                bQuery={b_query}
              />
            );
          }
          return null;
        }
        return <TextContent key={`text-${idx}`} content={seg.text} />;
      })}
    </>
  );
}

function TextContent({ content }: { content: string }) {
  // Simple markdown rendering
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = '';
  let codeLanguage = '';
  let inTable = false;
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = line.slice(3);
      } else {
        elements.push(
          <pre key={`code-${i}`} className="code-block">
            <code>{codeContent.trim()}</code>
          </pre>
        );
        codeContent = '';
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // Tables
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').filter(Boolean).map(c => c.trim());
      if (line.includes('---')) {
        // Header separator
        continue;
      }
      tableRows.push(cells);
      
      // Check if next line is not a table
      if (!lines[i + 1]?.includes('|')) {
        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-4">
            <table className="min-w-full border border-border rounded-md">
              <thead>
                <tr className="bg-muted/50">
                  {tableRows[0]?.map((cell, j) => (
                    <th key={j} className="px-3 py-2 text-left text-xs font-medium border-b border-border">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, j) => (
                  <tr key={j} className="border-b border-border last:border-0">
                    {row.map((cell, k) => (
                      <td key={k} className="px-3 py-2 text-sm">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
      continue;
    }

    // Headers
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="text-base font-semibold mt-4 mb-2">{line.slice(3)}</h3>);
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="text-sm font-medium mt-3 mb-1.5">{line.slice(4)}</h4>);
      continue;
    }

    // Lists
    if (line.match(/^\d+\.\s/)) {
      const text = line.replace(/^\d+\.\s/, '');
      elements.push(
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-muted-foreground">{line.match(/^\d+/)?.[0]}.</span>
          <span><InlineFormatting text={text} /></span>
        </div>
      );
      continue;
    }
    if (line.startsWith('- ')) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-muted-foreground">•</span>
          <span><InlineFormatting text={line.slice(2)} /></span>
        </div>
      );
      continue;
    }

    // Empty lines
    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // Regular paragraph
    elements.push(<p key={i} className="leading-relaxed"><InlineFormatting text={line} /></p>);
  }

  return <>{elements}</>;
}

function InlineFormatting({ text }: { text: string }) {
  // Parse inline formatting into safe React elements (no dangerouslySetInnerHTML)
  const parts: React.ReactNode[] = [];
  // Match **bold** and `code` patterns
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Bold
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      // Inline code
      parts.push(
        <code key={match.index} className="bg-muted px-1 py-0.5 rounded text-sm">
          {match[3]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span>{parts}</span>;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
