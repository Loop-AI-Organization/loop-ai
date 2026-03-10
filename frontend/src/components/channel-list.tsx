import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Pin, Plus } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createChannel } from '@/lib/supabase-data';

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
    try {
      const channel = await createChannel(currentWorkspaceId, newChannelName.trim(), 'project');
      setChannels([...channels, channel]);
      setCurrentChannel(channel.id);
      setThreads([]);
      setMessages([]);
      setCurrentThread(null);
      navigate(`/app/${currentWorkspaceId}/${channel.id}`);
      setNewChannelOpen(false);
      setNewChannelName('');
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
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewChannelOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateChannel} disabled={creating || !newChannelName.trim()}>
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
  return (
    <div className="space-y-0.5">
      {channels.map((channel) => (
        <button
          key={channel.id}
          onClick={() => onSelect(channel.id)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors',
            'hover:bg-sidebar-accent',
            currentChannelId === channel.id
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              : 'text-sidebar-foreground'
          )}
        >
          {showAvatar && channel.avatar ? (
            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-2xs font-medium text-muted-foreground">
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
      ))}
    </div>
  );
}

