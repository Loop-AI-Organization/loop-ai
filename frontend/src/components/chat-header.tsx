import { Search, PanelRightClose, PanelRightOpen, Menu, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ChatHeader() {
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
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="w-48 pl-8 h-8 text-sm bg-muted/50 border-transparent focus:border-border"
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
