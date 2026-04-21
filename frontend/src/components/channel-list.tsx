import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Pin, Plus, MoreHorizontal, Pencil, Trash2, MessageSquare } from 'lucide-react';
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
import { launchDirectMessage, listDmCandidates } from '@/lib/dm';
import type { WorkspaceMember } from '@/types';

export function ChannelList() {
  const navigate = useNavigate();
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const [dmMembers, setDmMembers] = useState<WorkspaceMember[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [creatingDmFor, setCreatingDmFor] = useState<string | null>(null);

  const { channels, currentWorkspaceId, currentChannelId } = useAppStore();

  const workspaceChannels = channels.filter((c) => c.workspaceId === currentWorkspaceId);
  const projectChannels = workspaceChannels.filter((c) => c.type === 'project');
  const dmChannels = workspaceChannels.filter((c) => c.type === 'dm');
  const filteredDmMembers = useMemo(() => {
    const query = dmSearch.trim().toLowerCase();
    if (!query) return dmMembers;
    return dmMembers.filter((member) => {
      const haystack = `${member.displayName ?? ''} ${member.email ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [dmMembers, dmSearch]);

  useEffect(() => {
    if (!newDmOpen || !currentWorkspaceId) return;
    let cancelled = false;
    setDmLoading(true);
    setDmError(null);
    listDmCandidates(currentWorkspaceId)
      .then((members) => {
        if (!cancelled) setDmMembers(members);
      })
      .catch((e) => {
        if (!cancelled) {
          setDmMembers([]);
          setDmError(e instanceof Error ? e.message : 'Failed to load members');
        }
      })
      .finally(() => {
        if (!cancelled) setDmLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [newDmOpen, currentWorkspaceId]);

  const handleCreateChannel = async () => {
    if (!currentWorkspaceId || !newChannelName.trim()) return;
    setCreating(true);
    setNewChannelOpen(false);
    const name = newChannelName.trim();
    setNewChannelName('');
    try {
      const channel = await createChannel(currentWorkspaceId, name, 'project');
      // Merge the new channel into the cached channels for this workspace.
      useAppStore.setState((s) => ({ channels: [...s.channels, channel] }));
      navigate(`/app/${currentWorkspaceId}/${channel.id}`);
    } catch (e) {
      console.error('Failed to create channel:', e);
    } finally {
      setCreating(false);
    }
  };

  // Channel selection is purely navigation — WorkspaceChannel.tsx syncs store state.
  const handleSelectChannel = (channelId: string) => {
    if (channelId === currentChannelId || !currentWorkspaceId) return;
    navigate(`/app/${currentWorkspaceId}/${channelId}`);
  };

  const handleStartDm = async (otherUserId: string) => {
    if (!currentWorkspaceId || creatingDmFor) return;
    setCreatingDmFor(otherUserId);
    setDmError(null);
    try {
      const channel = await launchDirectMessage(currentWorkspaceId, otherUserId);
      setNewDmOpen(false);
      setDmSearch('');
      navigate(`/app/${currentWorkspaceId}/${channel.id}`);
    } catch (e) {
      setDmError(e instanceof Error ? e.message : 'Failed to start direct message');
    } finally {
      setCreatingDmFor(null);
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
            currentWorkspaceId={currentWorkspaceId}
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
            currentWorkspaceId={currentWorkspaceId}
            onSelect={handleSelectChannel}
            icon={MessageSquare}
          />
          <div className="px-3 py-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-sidebar-foreground"
              onClick={() => {
                setDmSearch('');
                setDmError(null);
                setNewDmOpen(true);
              }}
              disabled={!currentWorkspaceId}
            >
              <Plus className="w-3.5 h-3.5" />
              New DM
            </Button>
          </div>
        </div>

        {/* Pinned — empty state */}
        <div className="px-2">
          <div className="flex items-center gap-2 px-2 py-1.5 text-2xs font-medium text-text-tertiary uppercase tracking-wider">
            <Pin className="w-3 h-3" />
            Pinned
          </div>
          <div className="px-2 py-3 text-xs text-text-tertiary">No pinned conversations</div>
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
              onKeyDown={(e) => e.key === 'Enter' && void handleCreateChannel()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewChannelOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void handleCreateChannel()}
              disabled={creating || !newChannelName.trim()}
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New DM dialog */}
      <Dialog
        open={newDmOpen}
        onOpenChange={(open) => {
          setNewDmOpen(open);
          if (!open) {
            setDmSearch('');
            setDmError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start direct message</DialogTitle>
            <DialogDescription>Select a workspace member to chat with.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="dm-member-search">Find member</Label>
              <Input
                id="dm-member-search"
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
                placeholder="Search by name or email"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              {dmLoading ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">Loading members…</p>
              ) : filteredDmMembers.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">No members found.</p>
              ) : (
                <div className="divide-y divide-border">
                  {filteredDmMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className="w-full px-3 py-2.5 text-left hover:bg-muted/40 transition-colors disabled:opacity-60"
                      onClick={() => void handleStartDm(member.userId)}
                      disabled={creatingDmFor !== null}
                    >
                      <p className="text-sm font-medium truncate">
                        {member.displayName ?? member.email ?? 'User'}
                      </p>
                      {member.displayName && member.email ? (
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      ) : null}
                      {creatingDmFor === member.userId ? (
                        <p className="text-xs text-muted-foreground mt-1">Opening…</p>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {dmError && <p className="text-sm text-destructive">{dmError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDmOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

// ── ChannelGroup ─────────────────────────────────────────────────────────────

interface ChannelGroupProps {
  channels: Array<{ id: string; name: string; unreadCount: number; avatar?: string; type?: 'project' | 'dm' }>;
  currentChannelId: string | null;
  currentWorkspaceId: string | null;
  onSelect: (id: string) => void;
  icon: React.ComponentType<{ className?: string }>;
  showAvatar?: boolean;
}

function ChannelGroup({
  channels,
  currentChannelId,
  currentWorkspaceId,
  onSelect,
  icon: Icon,
  showAvatar,
}: ChannelGroupProps) {
  const navigate = useNavigate();
  const { user, workspaces } = useAppStore();

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);
  const isOwner = user && currentWorkspace?.ownerId === user.id;

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

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
      useAppStore.setState((s) => ({
        channels: s.channels.map((c) =>
          c.id === renameId ? { ...c, name: updated.name } : c
        ),
      }));
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

    const targetId = deleteId;

    // Optimistic: remove from store immediately.
    useAppStore.setState((s) => ({
      channels: s.channels.filter((c) => c.id !== targetId),
    }));

    // If the deleted channel was active, navigate to another channel in the SAME workspace.
    if (currentChannelId === targetId) {
      const remaining = useAppStore
        .getState()
        .channels.filter(
          (c) => c.workspaceId === currentWorkspaceId && c.type === 'project'
        );
      const fallback = remaining.find((c) => c.name === 'general') ?? remaining[0];

      if (fallback && currentWorkspaceId) {
        navigate(`/app/${currentWorkspaceId}/${fallback.id}`);
      } else {
        // No channels left in this workspace — go to app root (will create general).
        navigate('/app');
      }
    }

    setDeleteOpen(false);
    setDeleteId(null);
    setDeleting(false);

    // Background delete.
    try {
      await deleteChannel(targetId);
    } catch (e) {
      console.error('Failed to delete channel:', e);
      // Revert optimistic update.
      const target = channels.find((c) => c.id === targetId);
      if (target) {
        useAppStore.setState((s) => ({ channels: [...s.channels, target] }));
      }
    }
  };

  const channelToRename = channels.find((c) => c.id === renameId);
  const channelToDelete = channels.find((c) => c.id === deleteId);

  return (
    <>
      <div className="space-y-0.5">
        {channels.map((channel) => {
          const isDm = channel.type === 'dm';
          const canRename = isOwner && !showAvatar && !isDm;
          const canDelete = !showAvatar && (isOwner || isDm);

          return (
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

            {canDelete && (
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
                    {canRename && (
                      <>
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
                      </>
                    )}
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
          );
        })}
      </div>

      {/* Rename Channel Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename channel</DialogTitle>
            <DialogDescription>Enter a new name for "#{channelToRename?.name}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-channel">New name</Label>
            <Input
              id="rename-channel"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && void handleRename()}
            />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void handleRename()}
              disabled={renaming || !renameName.trim()}
            >
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
              Are you sure you want to delete "#{channelToDelete?.name}"? All messages inside will be
              permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
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
