import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Paperclip, AtSign, Slash, Zap } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { streamAssistant } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Message, Action } from '@/types';

export function Composer() {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { 
    currentThreadId,
    orchestratorStatus,
    addMessage,
    addAction,
    updateAction,
    setOrchestratorStatus,
    setStreamingMessageId,
    createThread,
    currentChannelId,
  } = useAppStore();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [value]);

  const handleSubmit = async () => {
    if (!value.trim() || orchestratorStatus !== 'ready') return;

    let threadId = currentThreadId;
    
    // Create thread if none exists
    if (!threadId && currentChannelId) {
      const newThread = createThread(currentChannelId, value.slice(0, 50));
      threadId = newThread.id;
    }

    if (!threadId) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      threadId,
      role: 'user',
      content: value.trim(),
      createdAt: new Date(),
    };

    addMessage(userMessage);
    setValue('');
    setOrchestratorStatus('thinking');

    // Create streaming assistant message placeholder
    const assistantMessageId = `msg-${Date.now() + 1}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      threadId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      isStreaming: true,
    };
    
    addMessage(assistantMessage);
    setStreamingMessageId(assistantMessageId);
    setOrchestratorStatus('running');

    // Stream response
    await streamAssistant(threadId, userMessage.content, {
      onToken: (token) => {
        useAppStore.getState().appendToMessage(assistantMessageId, token);
      },
      onComplete: () => {
        useAppStore.getState().updateMessage(assistantMessageId, { isStreaming: false });
        setStreamingMessageId(null);
        setOrchestratorStatus('ready');
      },
      onActionUpdate: (action: Action) => {
        const existingAction = useAppStore.getState().actions.find(a => a.id === action.id);
        if (existingAction) {
          updateAction(action.id, action);
        } else {
          addAction(action);
        }
      },
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const statusConfig = {
    ready: { label: 'Ready', color: 'text-accent-success' },
    thinking: { label: 'Thinking...', color: 'text-accent-info' },
    running: { label: 'Running actions', color: 'text-accent-info' },
  };

  const status = statusConfig[orchestratorStatus];

  return (
    <div className="border-t border-border bg-card p-4 space-y-3">
      {/* Composer box */}
      <div className="relative bg-background border border-border rounded-lg focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">
        <Textarea
          ref={textareaRef}
          data-composer-input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message... (Cmd+Enter to send)"
          className="min-h-[44px] max-h-[200px] border-0 bg-transparent resize-none focus-visible:ring-0 focus-visible:ring-offset-0 pr-24"
          disabled={orchestratorStatus !== 'ready'}
        />
        
        {/* Action buttons */}
        <div className="absolute right-2 bottom-2 flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Attach file">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button 
            size="icon" 
            className="h-8 w-8"
            onClick={handleSubmit}
            disabled={!value.trim() || orchestratorStatus !== 'ready'}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Footer hints */}
      <div className="flex items-center justify-between text-2xs">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="kbd">Shift</kbd>
            <span>+</span>
            <kbd className="kbd">Enter</kbd>
            <span>for newline</span>
          </span>
          <span className="hidden sm:flex items-center gap-1.5 text-muted-foreground/60">
            <AtSign className="w-3 h-3" />
            <span>mention</span>
            <Slash className="w-3 h-3 ml-2" />
            <span>command</span>
          </span>
        </div>
        
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Orchestrator:</span>
            <span className={cn('font-medium', status.color)}>
              {status.label}
            </span>
          </div>
          {orchestratorStatus !== 'ready' && (
            <div className="w-1.5 h-1.5 rounded-full bg-accent-info animate-pulse-subtle" />
          )}
        </div>
      </div>
    </div>
  );
}
