import { AppSidebar } from './app-sidebar';
import { ChatHeader } from './chat-header';
import { MessageList } from './message-list';
import { Composer } from './composer';
import { InspectorPanel } from './inspector-panel';
import { CommandPalette } from './command-palette';
import { ActionChipsBar } from './action-chip';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

export function AppShell() {
  useKeyboardShortcuts();
  
  const { actions, currentThreadId, isInspectorOpen, isSidebarOpen } = useAppStore();
  
  // Get streaming/active actions for the current thread
  const activeActions = actions.filter(a => 
    a.threadId === currentThreadId && 
    (a.status === 'running' || a.status === 'queued')
  );

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Left Sidebar */}
      <AppSidebar />

      {/* Main Content */}
      <main className={cn(
        'flex-1 flex flex-col min-w-0 transition-all duration-200',
        !isSidebarOpen && 'lg:ml-0'
      )}>
        {/* Chat Header */}
        <ChatHeader />

        {/* Chat Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Message Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Messages */}
            <MessageList />

            {/* Action Chips Bar */}
            <ActionChipsBar actions={activeActions} />

            {/* Composer */}
            <Composer />
          </div>

          {/* Right Inspector Panel */}
          <InspectorPanel />
        </div>
      </main>

      {/* Command Palette */}
      <CommandPalette />
    </div>
  );
}
