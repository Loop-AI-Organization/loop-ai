import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppSidebar } from './app-sidebar';
import { ChatHeader } from './chat-header';
import { MessageList } from './message-list';
import { Composer } from './composer';
import { InspectorPanel } from './inspector-panel';
import { CommandPalette } from './command-palette';
import { ActionChipsBar } from './action-chip';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useAppData } from '@/hooks/use-app-data';
import { useRealtimeMessages } from '@/hooks/use-realtime-messages';
import { useAppStore } from '@/store/app-store';
import { acceptWorkspaceInvite, fetchChannels } from '@/lib/supabase-data';
import { cn } from '@/lib/utils';

export function AppShell() {
  useKeyboardShortcuts();
  useRealtimeMessages();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dataLoading, dataError } = useAppData();
  const acceptInviteDone = useRef(false);

  const {
    actions,
    currentChannelId,
    isInspectorOpen,
    isSidebarOpen,
  } = useAppStore();

  // After sign-up from invite link: ?workspace_id=...&invited=1 → accept invite and go to workspace
  useEffect(() => {
    const workspaceId = searchParams.get('workspace_id');
    const invited = searchParams.get('invited');
    if (!workspaceId || invited !== '1' || acceptInviteDone.current || dataLoading) return;
    acceptInviteDone.current = true;
    acceptWorkspaceInvite(workspaceId)
      .then(() => fetchChannels(workspaceId))
      .then((channels) => {
        // Cache channels for the joined workspace without wiping other workspaces.
        useAppStore.getState().mergeChannels(workspaceId, channels);
        const firstId = channels[0]?.id;
        setSearchParams({}, { replace: true });
        if (firstId) {
          navigate(`/app/${workspaceId}/${firstId}`, { replace: true });
        }
      })
      .catch(() => {
        acceptInviteDone.current = false;
        setSearchParams({}, { replace: true });
      });
  }, [searchParams, dataLoading, navigate, setSearchParams]);
  
  // Get streaming/active actions for the current thread
  const activeActions = actions.filter(
    (a) => !!currentChannelId && (a.status === 'running' || a.status === 'pending')
  );

  if (dataLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading your workspaces…</div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-2">
          <p className="text-destructive">{dataError}</p>
          <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
        </div>
      </div>
    );
  }

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
