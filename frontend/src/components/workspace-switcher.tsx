import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LayoutGrid, Plus } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  createWorkspace,
  createChannel,
  fetchChannels,
  joinWorkspaceByCode,
} from '@/lib/supabase-data';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
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
      const workspace = await createWorkspace({ name: 'New Workspace' });
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

  const handleJoinByCode = async () => {
    if (joining) return;
    const raw = joinCode.trim();
    if (!raw) return;
    setJoining(true);
    setJoinError(null);
    try {
      const code = raw.toUpperCase();
      const { workspace } = await joinWorkspaceByCode(code);
      setWorkspaces(prev => {
        const without = prev.filter(w => w.id !== workspace.id);
        return [...without, workspace];
      });
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
      setJoinOpen(false);
      setJoinCode('');
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Failed to join workspace');
    } finally {
      setJoining(false);
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
            <LayoutGrid className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="text-left min-w-0">
              <div className="font-medium text-sm text-sidebar-foreground truncate">
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
            <span className="font-medium">{workspace.name}</span>
          </DropdownMenuItem>
        ))}
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
        <DropdownMenuItem
          className="flex items-center gap-3 py-2 text-muted-foreground"
          onSelect={() => {
            setJoinOpen(true);
            setJoinError(null);
            setJoinCode('');
          }}
        >
          <div className="w-7 h-7 rounded-md border border-dashed border-border flex items-center justify-center">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span>Join workspace by code</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="workspace-code">Share code</Label>
            <Input
              id="workspace-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. AB3F9K"
              onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
            />
            {joinError && <p className="text-sm text-destructive">{joinError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleJoinByCode()} disabled={joining || !joinCode.trim()}>
              {joining ? 'Joining…' : 'Join'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}
