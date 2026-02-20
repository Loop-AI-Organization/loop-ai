import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Settings } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { createWorkspace, createChannel, fetchChannels } from '@/lib/supabase-data';

export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(false);
  const {
    workspaces,
    currentWorkspaceId,
    setCurrentWorkspace,
    setWorkspaces,
    setChannels,
    setThreads,
    setMessages,
    setCurrentChannel,
    setCurrentThread,
  } = useAppStore();
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);

  const handleSwitchWorkspace = async (workspace: { id: string }) => {
    if (workspace.id === currentWorkspaceId) return;
    setSwitching(true);
    try {
      const channels = await fetchChannels(workspace.id);
      setChannels(channels);
      setThreads([]);
      setMessages([]);
      setCurrentThread(null);
      setCurrentWorkspace(workspace.id);
      const firstChannelId = channels[0]?.id;
      if (firstChannelId) {
        setCurrentChannel(firstChannelId);
        setTimeout(() => navigate(`/app/${workspace.id}/${firstChannelId}`), 0);
      } else {
        useAppStore.setState({ currentChannelId: null });
        navigate('/app');
      }
    } finally {
      setSwitching(false);
    }
  };

  const handleNewWorkspace = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const workspace = await createWorkspace({ name: 'New Workspace', icon: '◎' });
      const channel = await createChannel(workspace.id, 'general');
      setWorkspaces([...workspaces, workspace]);
      setChannels([channel]);
      setThreads([]);
      setMessages([]);
      setCurrentThread(null);
      setCurrentWorkspace(workspace.id);
      setCurrentChannel(channel.id);
      setTimeout(() => navigate(`/app/${workspace.id}/${channel.id}`), 0);
    } finally {
      setCreating(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="w-full justify-between px-3 py-2 h-auto hover:bg-sidebar-accent"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm">
              {currentWorkspace?.icon || '◎'}
            </div>
            <div className="text-left">
              <div className="font-medium text-sm text-sidebar-foreground">
                {currentWorkspace?.name || 'Select Workspace'}
              </div>
              <div className="text-2xs text-text-tertiary">
                Workspace
              </div>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-text-tertiary" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onSelect={() => void handleSwitchWorkspace(workspace)}
            disabled={switching}
            className="flex items-center gap-3 py-2"
          >
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-semibold text-xs">
              {workspace.icon}
            </div>
            <span className="font-medium">{workspace.name}</span>
          </DropdownMenuItem>
        ))}
        {currentWorkspaceId && (
          <DropdownMenuItem
            className="flex items-center gap-3 py-2 text-muted-foreground"
            onSelect={() => navigate(`/app/${currentWorkspaceId}/settings`)}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Workspace settings</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="flex items-center gap-3 py-2 text-muted-foreground"
          onSelect={() => void handleNewWorkspace()}
          disabled={creating}
        >
          <div className="w-7 h-7 rounded-md border border-dashed border-border flex items-center justify-center">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span>{creating ? 'Creating…' : 'New Workspace'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
