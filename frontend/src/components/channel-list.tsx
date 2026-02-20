import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, MessageCircle, Pin, Plus } from 'lucide-react';
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
import { createChannel, fetchWorkspaceMembers, createDmChannel, addWorkspaceMemberByEmail } from '@/lib/supabase-data';
import { getSupabase } from '@/lib/supabase';
import type { WorkspaceMember } from '@/types';

export function ChannelList() {
  const navigate = useNavigate();
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const [dmMembers, setDmMembers] = useState<WorkspaceMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [dmInviteEmail, setDmInviteEmail] = useState('');
  const [dmInviteError, setDmInviteError] = useState<string | null>(null);
  const [dmInviteSuccess, setDmInviteSuccess] = useState<string | null>(null);
  const [dmInviting, setDmInviting] = useState(false);
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

  const workspaceChannels = channels.filter(c => c.workspaceId === currentWorkspaceId);
  const projectChannels = workspaceChannels.filter(c => c.type === 'project');
  const dmChannels = workspaceChannels.filter(c => c.type === 'dm');

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

  const handleOpenNewDm = () => {
    setNewDmOpen(true);
    if (!currentWorkspaceId) return;
    getSupabase().auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
    fetchWorkspaceMembers(currentWorkspaceId).then((list) => setDmMembers(list)).catch(() => setDmMembers([]));
  };

  const handleCreateDm = async (otherUserId: string) => {
    if (!currentWorkspaceId) return;
    setCreating(true);
    try {
      const channel = await createDmChannel(currentWorkspaceId, otherUserId);
      const exists = channels.some(c => c.id === channel.id);
      if (!exists) setChannels([...channels, channel]);
      setCurrentChannel(channel.id);
      setThreads([]);
      setMessages([]);
      setCurrentThread(null);
      navigate(`/app/${currentWorkspaceId}/${channel.id}`);
      setNewDmOpen(false);
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

  const handleDmInviteByEmail = async () => {
    if (!currentWorkspaceId || !dmInviteEmail.trim()) return;
    setDmInviting(true);
    setDmInviteError(null);
    setDmInviteSuccess(null);
    try {
      const result = await addWorkspaceMemberByEmail(currentWorkspaceId, dmInviteEmail.trim());
      if (result.userId) {
        const channel = await createDmChannel(currentWorkspaceId, result.userId);
        const exists = channels.some(c => c.id === channel.id);
        if (!exists) setChannels([...channels, channel]);
        setCurrentChannel(channel.id);
        setThreads([]);
        setMessages([]);
        setCurrentThread(null);
        navigate(`/app/${currentWorkspaceId}/${channel.id}`);
        setNewDmOpen(false);
        const list = await fetchWorkspaceMembers(currentWorkspaceId);
        setDmMembers(list);
      } else {
        setDmInviteSuccess(result.message ?? 'Invite email sent. When they sign up, they\'ll be in the workspace and you can start a DM.');
        setDmInviteEmail('');
      }
    } catch (e) {
      setDmInviteError(e instanceof Error ? e.message : 'Invite failed');
    } finally {
      setDmInviting(false);
    }
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

        {/* Direct Messages */}
        <div>
          <div className="flex items-center gap-2 px-4 py-1.5 text-2xs font-medium text-text-tertiary uppercase tracking-wider">
            Direct Messages
          </div>
          <ChannelGroup
            channels={dmChannels}
            currentChannelId={currentChannelId}
            onSelect={handleSelectChannel}
            icon={MessageCircle}
            showAvatar
          />
          <div className="px-3 py-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-sidebar-foreground"
              onClick={handleOpenNewDm}
              disabled={!currentWorkspaceId}
            >
              <Plus className="w-3.5 h-3.5" />
              New DM
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

      {/* New DM dialog - pick a workspace member or invite by email */}
      <Dialog open={newDmOpen} onOpenChange={(open) => { setNewDmOpen(open); if (!open) { setDmInviteEmail(''); setDmInviteError(null); setDmInviteSuccess(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New DM</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Choose a workspace member to start a direct message, or invite by email.</p>
          <div className="max-h-48 overflow-auto space-y-1">
            {dmMembers
              .filter((m) => m.userId !== currentUserId)
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={creating}
                  onClick={() => void handleCreateDm(m.userId)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm hover:bg-sidebar-accent transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {m.userId.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="truncate">{m.email ?? m.userId}</span>
                </button>
              ))}
            {currentUserId && dmMembers.filter((m) => m.userId !== currentUserId).length === 0 && (
              <p className="text-sm text-muted-foreground py-2">No other members in this workspace.</p>
            )}
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <Label className="text-xs text-muted-foreground">Invite by email</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                value={dmInviteEmail}
                onChange={(e) => setDmInviteEmail(e.target.value)}
                placeholder="email@example.com"
                onKeyDown={(e) => e.key === 'Enter' && handleDmInviteByEmail()}
                className="flex-1"
              />
              <Button size="sm" onClick={() => void handleDmInviteByEmail()} disabled={dmInviting || !dmInviteEmail.trim()}>
                {dmInviting ? 'Inviting…' : 'Invite'}
              </Button>
            </div>
            {dmInviteError && <p className="text-sm text-destructive">{dmInviteError}</p>}
            {dmInviteSuccess && <p className="text-sm text-green-600 dark:text-green-400">{dmInviteSuccess}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDmOpen(false)}>
              Cancel
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
