import { Search, PanelRightClose, PanelRightOpen, Menu, ChevronRight, MessageSquare } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ChatHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    workspaces,
    channels,
    currentWorkspaceId,
    currentChannelId,
    isInspectorOpen,
    toggleInspector,
    toggleSidebar,
    setCommandPaletteOpen,
  } = useAppStore();

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);
  const currentChannel = channels.find((c) => c.id === currentChannelId);

  // Hide "Back to AI Chat" button when already at /app route
  const isAtAppRoute = location.pathname === '/app';

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card flex-shrink-0">
      {/* Left: Menu + Breadcrumbs */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={toggleSidebar}
        >
          <Menu className="w-5 h-5" />
        </Button>

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">{currentWorkspace?.name}</span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{currentChannel?.name}</span>
        </nav>

        {/* Back to AI Chat - hidden when at /app route */}
        {!isAtAppRoute && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/app')}
            className="text-[#40bfae] hover:text-[#40bfae] hover:bg-[#40bfae]/10 gap-1.5"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Back to AI Chat</span>
          </Button>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search channels or type a command..."
            className="w-64 pl-8 h-8 text-sm bg-muted/50 border-transparent focus:border-border"
            onClick={() => setCommandPaletteOpen(true)}
            readOnly
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 kbd">⌘K</kbd>
        </div>

        {/* Toggle Inspector */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleInspector}
          className="hidden md:flex"
        >
          {isInspectorOpen ? (
            <PanelRightClose className="w-5 h-5" />
          ) : (
            <PanelRightOpen className="w-5 h-5" />
          )}
        </Button>
      </div>
    </header>
  );
}
