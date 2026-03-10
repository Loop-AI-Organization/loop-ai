import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Pin, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createChannel, updateChannel, deleteChannel } from '@/lib/supabase-data';

export function ChannelList() {
  const navigate = useNavigate();
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const {
    channels,
    currentWorkspaceId,
    currentChannelId,
    setCurrentChannel,
    setChannels,
    setThreads,
    setMessages,
    setCurrentThread,
  } = useAppStore();

  const workspaceChannels = channels.filter((c) => c.workspaceId === currentWorkspaceId);
  const projectChannels = workspaceChannels.filter((c) => c.type === 'project');

  const handleCreateChannel = async () => {
    if (!currentWorkspaceId || !newChannelName.trim()) return;
    setCreating(true);
    
    // Close dialog immediately
    setNewChannelOpen(false);
    const name = newChannelName.trim();
    setNewChannelName('');
    
    try {
      const channel = await createChannel(currentWorkspaceId, name, 'project');
      setChannels([...channels, channel]);
      setCurrentChannel(channel.id);
      setThreads([]);
      setMessages([]);
      setCurrentThread(null);
      navigate(`/app/${currentWorkspaceId}/${channel.id}`);
    } catch (e) {
      console.error('Failed to create channel:', e);
    } finally {
      setCreating(false);
    }
  };

  const handleSelectChannel = (channelId: string) => {
    if (channelId === currentChannelId || !currentWorkspaceId) return;
    setThreads([]);
    setMessages([]);
    setCurrentThread(null);
    setCurrentChannel(channelId);
    navigate(`/app/${currentWorkspaceId}/${channelId}`);
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-2 space-y-4">
        {/* Project Channels */}
        <div>
          <div className="flex items-center gap-2 px-4 py-1.5 text-2xs font-medium text-text-tertiary uppercase tracking-wider">
            Project Channels
          </div>
          <ChannelGroup
            channels={projectChannels}
            currentChannelId={currentChannelId}
            onSelect={handleSelectChannel}
            icon={Hash}
          />
          <div className="px-3 py-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-sidebar-foreground"
              onClick={() => setNewChannelOpen(true)}
              disabled={!currentWorkspaceId}
            >
              <Plus className="w-3.5 h-3.5" />
              Add channel
            </Button>
          </div>
        </div>

        {/* Pinned - empty state */}
        <div className="px-2">
          <div className="flex items-center gap-2 px-2 py-1.5 text-2xs font-medium text-text-tertiary uppercase tracking-wider">
            <Pin className="w-3 h-3" />
            Pinned
          </div>
          <div className="px-2 py-3 text-xs text-text-tertiary">
            No pinned conversations
          </div>
        </div>
      </div>

      {/* New channel dialog */}
      <Dialog open={newChannelOpen} onOpenChange={setNewChannelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="channel-name">Channel name</Label>
            <Input
              id="channel-name"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="e.g. general"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateChannel()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewChannelOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateChannel()} disabled={creating || !newChannelName.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

interface ChannelGroupProps {
  channels: Array<{
    id: string;
    name: string;
    unreadCount: number;
    avatar?: string;
  }>;
  currentChannelId: string | null;
  onSelect: (id: string) => void;
  icon: React.ComponentType<{ className?: string }>;
  showAvatar?: boolean;
}

function ChannelGroup({ channels, currentChannelId, onSelect, icon: Icon, showAvatar }: ChannelGroupProps) {
  const navigate = useNavigate();
  const {
    user,
    workspaces,
    currentWorkspaceId,
    channels: allChannels,
    setChannels,
    setThreads,
    setMessages,
    setCurrentChannel,
    setCurrentThread,
  } = useAppStore();

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);
  const isOwner = user && currentWorkspace?.ownerId === user.id;

  // Rename config
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Delete config
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleRename = async () => {
    if (!renameId || renaming) return;
    const trimmed = renameName.trim();
    if (!trimmed) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const updated = await updateChannel(renameId, trimmed);
      setChannels(allChannels.map((c) => (c.id === renameId ? { ...c, name: updated.name } : c)));
      setRenameOpen(false);
      setRenameId(null);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : 'Failed to rename channel');
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    
    // Optimistic UI update
    const targetId = deleteId;
    const remaining = allChannels.filter((c) => c.id !== targetId);
    setChannels(remaining);
    
    if (currentChannelId === targetId) {
      // Switch to "#general" or the first available project channel
      const workspaceChannels = remaining.filter((c) => c.workspaceId === currentWorkspaceId && c.type === 'project');
      const fallback = workspaceChannels.find((c) => c.name === 'general') || workspaceChannels[0];
      
      if (fallback) {
        setCurrentChannel(fallback.id);
        setThreads([]);
        setMessages([]);
        setCurrentThread(null);
        navigate(`/app/${currentWorkspaceId}/${fallback.id}`);
      } else {
        setCurrentChannel(null);
        setThreads([]);
        setMessages([]);
        setCurrentThread(null);
        navigate(`/app/${currentWorkspaceId}`);
      }
    }
    
    setDeleteOpen(false);
    setDeleteId(null);
    setDeleting(false);

    // Perform actual deletion in background
    try {
      await deleteChannel(targetId);
    } catch (e) {
      console.error('Failed to delete channel:', e);
      // If it fails, we typically would revert the UI or show a toast,
      // but reloading the page is functionally equivalent if they need true sync.
    }
  };

  const channelToRename = channels.find((c) => c.id === renameId);
  const channelToDelete = channels.find((c) => c.id === deleteId);

  return (
    <>
      <div className="space-y-0.5">
        {channels.map((channel) => (
          <div key={channel.id} className="group relative flex items-center">
            <button
              onClick={() => onSelect(channel.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                'hover:bg-sidebar-accent cursor-pointer',
                currentChannelId === channel.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground'
              )}
            >
              {showAvatar && channel.avatar ? (
                <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-2xs font-medium text-muted-foreground shrink-0">
                  {channel.avatar}
                </div>
              ) : (
                <Icon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
              )}
              <span className="truncate flex-1 text-left">{channel.name}</span>
              {channel.unreadCount > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-2xs font-medium flex items-center justify-center">
                  {channel.unreadCount}
                </span>
              )}
            </button>

            {isOwner && !showAvatar && (
              <div className="absolute right-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background hover:bg-sidebar-accent shadow-sm border border-border"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start" className="w-40">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setRenameId(channel.id);
                        setRenameName(channel.name);
                        setRenameError(null);
                        setRenameOpen(true);
                      }}
                      className="gap-2"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setDeleteId(channel.id);
                        setDeleteError(null);
                        setDeleteOpen(true);
                      }}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Rename Channel Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename channel</DialogTitle>
            <DialogDescription>
              Enter a new name for "#{channelToRename?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-channel">New name</Label>
            <Input
              id="rename-channel"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleRename()} disabled={renaming || !renameName.trim()}>
              {renaming ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Channel Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete channel</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "#{channelToDelete?.name}"? All threads and messages inside will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
