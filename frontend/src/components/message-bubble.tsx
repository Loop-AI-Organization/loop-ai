import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import { User, Bot, Trash2 } from 'lucide-react';
import { useRef, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';

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
              <MessageContent content={message.content} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
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
  // Bold
  let formatted = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>');
  
  return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
