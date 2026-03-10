import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Paperclip, Bot, Zap, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/app-store';
import {
  createThread as createThreadInSupabase,
  insertMessage as insertMessageInSupabase,
  uploadThreadFile,
  triageAndRespond,
  fetchChannels,
  fetchThreads,
  fetchMessages,
} from '@/lib/supabase-data';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

/** Check if message contains @ai mention (case-insensitive) */
const hasAiMention = (text: string) => /@ai\b/i.test(text);

export function Composer() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [navigationBanner, setNavigationBanner] = useState<{
    channelName?: string;
    workspaceName?: string;
    channelId: string;
    workspaceId: string;
  } | null>(null);

  const {
    currentThreadId,
    currentWorkspaceId,
    currentChannelId,
    orchestratorStatus,
    addMessage,
    setOrchestratorStatus,
    addThread,
    setCurrentWorkspace,
    setCurrentChannel,
    setChannels,
    setThreads,
    setMessages,
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
    const content = value.trim();
    const mentionsAi = hasAiMention(content);
    let threadId = currentThreadId;

    // Create thread in Supabase if none exists
    if (!threadId && currentWorkspaceId && currentChannelId) {
      try {
        const newThread = await createThreadInSupabase(
          currentWorkspaceId,
          currentChannelId,
          content.slice(0, 50) || 'Untitled thread'
        );
        addThread(newThread);
        threadId = newThread.id;
      } catch {
        return;
      }
    }

    if (!threadId || !currentChannelId) return;

    // Persist user message to Supabase and add to store
    try {
      const userMessage = await insertMessageInSupabase(threadId, 'user', content);
      addMessage(userMessage);
    } catch {
      addMessage({
        id: `msg-${Date.now()}`,
        threadId,
        role: 'user',
        content,
        createdAt: new Date(),
      });
    }

    setValue('');

    // If user didn't @ai, just send the message — no AI response
    if (!mentionsAi) {
      return;
    }

    // --- @ai was mentioned: get AI response ---
    setOrchestratorStatus('thinking');

    // Build message history for context
    const { messages: stateMessages } = useAppStore.getState();
    const threadMessages = stateMessages
      .filter(
        (m) =>
          m.threadId === threadId &&
          m.content.trim().length > 0 &&
          (m.role === 'user' || m.role === 'assistant')
      )
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const result = await triageAndRespond(currentChannelId, threadId, threadMessages);

      if (result.navigation) {
        // AI detected a navigation request — navigate to the target channel
        const { channelId, workspaceId, channelName, workspaceName } = result.navigation;
        setNavigationBanner({ channelId, workspaceId, channelName, workspaceName });
        // Load the target workspace/channel data then navigate
        try {
          const channels = await fetchChannels(workspaceId);
          setChannels(channels);
          const threads = await fetchThreads(channelId);
          setThreads(threads);
          const latest = threads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
          const msgs = latest ? await fetchMessages(latest.id) : [];
          setMessages(msgs);
          setCurrentWorkspace(workspaceId);
          setCurrentChannel(channelId);
        } catch {
          // Navigation data load failed — still navigate, data will load via useAppData
          setCurrentWorkspace(workspaceId);
          setCurrentChannel(channelId);
        }
        navigate(`/app/${workspaceId}/${channelId}`);
        setTimeout(() => setNavigationBanner(null), 3000);
      } else if (result.shouldRespond && result.content) {
        const assistantMessage: Message = {
          id: result.messageId || `msg-ai-${Date.now()}`,
          threadId,
          role: 'assistant',
          content: result.content,
          createdAt: new Date(),
        };
        addMessage(assistantMessage);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI response failed';
      addMessage({
        id: `msg-err-${Date.now()}`,
        threadId,
        role: 'assistant',
        content: `[Assistant Error] ${message}`,
        createdAt: new Date(),
      });
    }

    setOrchestratorStatus('ready');
  };

  const handleAttachFile = () => {
    if (!currentThreadId || !currentWorkspaceId) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentThreadId || !currentWorkspaceId) return;
    setUploading(true);
    try {
      await uploadThreadFile(currentThreadId, currentWorkspaceId, file);
    } finally {
      setUploading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const showsAiHint = hasAiMention(value);

  const statusConfig = {
    ready: { label: 'Ready', color: 'text-accent-success' },
    thinking: { label: 'AI is thinking...', color: 'text-accent-info' },
    running: { label: 'Running actions', color: 'text-accent-info' },
  };

  const status = statusConfig[orchestratorStatus];

  return (
    <div className="border-t border-border bg-card p-4 space-y-3">
      {/* Navigation banner */}
      {navigationBanner && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent-success/10 text-accent-success text-xs font-medium animate-in fade-in slide-in-from-bottom-2">
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          <span>
            Navigating to{' '}
            <strong>
              {navigationBanner.workspaceName && `${navigationBanner.workspaceName} / `}
              {navigationBanner.channelName ?? 'channel'}
            </strong>
          </span>
        </div>
      )}

      {/* AI hint banner */}
      {showsAiHint && !navigationBanner && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
          <Bot className="w-3.5 h-3.5" />
          AI will respond to this message
        </div>
      )}

      {/* Composer box */}
      <div className="relative bg-background border border-border rounded-lg focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">
        <Textarea
          ref={textareaRef}
          data-composer-input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (use @ai to get an AI response)"
          className="min-h-[44px] max-h-[200px] border-0 bg-transparent resize-none focus-visible:ring-0 focus-visible:ring-offset-0 pr-24"
          disabled={orchestratorStatus !== 'ready'}
        />

        {/* Action buttons */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="*"
          onChange={handleFileChange}
        />
        <div className="absolute right-2 bottom-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Attach file"
            disabled={!currentThreadId || !currentWorkspaceId || uploading}
            onClick={handleAttachFile}
          >
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
            <Bot className="w-3 h-3" />
            <span>type <strong>@ai</strong> to get AI response</span>
          </span>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">AI:</span>
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
