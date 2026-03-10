import { useRef, useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { MessageBubble } from './message-bubble';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDown, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function MessageList() {
  const { messages, currentThreadId, streamingMessageId } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const threadMessages = messages.filter(m => m.threadId === currentThreadId);

  // Simulate loading
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, [currentThreadId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current && !showJumpButton) {
      // Use setTimeout to allow DOM to calculate new heights before scrolling
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [threadMessages.length, streamingMessageId, showJumpButton]);

  // Track scroll position
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowJumpButton(!isNearBottom);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setShowJumpButton(false);
    }
  };

  // Empty state
  if (!currentThreadId && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
            <MessageSquare className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">No thread selected</h3>
            <p className="text-sm text-muted-foreground">
              Select a channel to start chatting
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div 
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto scrollbar-thin"
        onScroll={handleScroll}
      >
        {isLoading ? (
          <MessageListSkeleton />
        ) : threadMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Start a conversation</h3>
                <p className="text-sm text-muted-foreground">
                  Type a message below to begin
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {threadMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={message.id === streamingMessageId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Jump to present button */}
      <div
        className={cn(
          'absolute bottom-4 left-1/2 -translate-x-1/2 transition-all duration-200',
          showJumpButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        )}
      >
        <Button
          size="sm"
          variant="secondary"
          className="shadow-soft-md gap-1.5"
          onClick={scrollToBottom}
        >
          <ArrowDown className="w-3.5 h-3.5" />
          Jump to present
        </Button>
      </div>
    </div>
  );
}

function MessageListSkeleton() {
  return (
    <div className="space-y-0 divide-y divide-border">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4 px-4 py-4">
          <Skeleton className="w-8 h-8 rounded-md flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
