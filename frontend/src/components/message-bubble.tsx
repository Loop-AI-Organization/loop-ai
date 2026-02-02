import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import { User, Bot } from 'lucide-react';
import { useRef, useEffect } from 'react';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [message.content, isStreaming]);

  return (
    <div
      className={cn(
        'flex gap-4 px-4 py-4 group',
        isUser && 'bg-muted/30'
      )}
    >
      {/* Avatar */}
      <div className={cn(
        'w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center',
        isUser ? 'bg-secondary' : 'bg-primary'
      )}>
        {isUser ? (
          <User className="w-4 h-4 text-secondary-foreground" />
        ) : (
          <Bot className="w-4 h-4 text-primary-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">
            {isUser ? 'You' : 'Loop AI'}
          </span>
          <span className="text-2xs text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-2xs text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-subtle" />
              Streaming
            </span>
          )}
        </div>

        {/* Message content */}
        <div 
          ref={contentRef}
          className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-surface-sunken prose-pre:border prose-pre:border-border"
        >
          <MessageContent content={message.content} />
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
