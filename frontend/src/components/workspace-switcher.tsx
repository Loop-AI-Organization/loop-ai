import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LayoutGrid, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  createWorkspace,
  createChannel,
  fetchChannels,
  joinWorkspaceByCode,
  updateWorkspace,
  deleteWorkspace,
} from '@/lib/supabase-data';
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

export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);

  // Join dialog
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Rename dialog
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { workspaces, user, currentWorkspaceId, setWorkspaces } = useAppStore();
  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Get a channel to navigate to for a given workspace.
   * Uses cached channels if available; fetches and caches them otherwise.
   * Prefers "general", then the first channel.
   */
  const resolveWorkspaceChannel = async (
    wsId: string
  ): Promise<{ workspaceId: string; channelId: string } | null> => {
    const state = useAppStore.getState();
    let wsChannels = state.channels.filter((c) => c.workspaceId === wsId);

    if (wsChannels.length === 0) {
      wsChannels = await fetchChannels(wsId);
      if (wsChannels.length > 0) {
        // Cache without wiping other workspaces' channels.
        useAppStore.getState().mergeChannels(wsId, wsChannels);
      }
    }

    const target =
      wsChannels.find((c) => c.name === 'general') ?? wsChannels[0] ?? null;
    return target ? { workspaceId: wsId, channelId: target.id } : null;
  };

  // ── Workspace switching ───────────────────────────────────────────────────

  const handleSwitchWorkspace = async (workspace: { id: string }) => {
    if (workspace.id === currentWorkspaceId || switching) return;
    setSwitching(true);
    try {
      const dest = await resolveWorkspaceChannel(workspace.id);
      if (dest) {
        navigate(`/app/${dest.workspaceId}/${dest.channelId}`);
      }
      // If the workspace has no channels yet, do nothing (user needs to create one).
    } catch {
      // ignore
    } finally {
      setSwitching(false);
    }
  };

  // ── Create workspace ──────────────────────────────────────────────────────

  const handleCreateWorkspace = async () => {
    const name = newName.trim() || 'New Workspace';
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const workspace = await createWorkspace({ name });
      const channel = await createChannel(workspace.id, 'general');

      // Update workspaces list and cache the new channel.
      useAppStore.setState((s) => ({
        workspaces: [...s.workspaces, workspace],
      }));
      useAppStore.getState().mergeChannels(workspace.id, [channel]);

      setCreateOpen(false);
      setNewName('');
      navigate(`/app/${workspace.id}/${channel.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  // ── Rename workspace ──────────────────────────────────────────────────────

  const handleRenameWorkspace = async () => {
    if (!renameId || renaming) return;
    const trimmed = renameName.trim();
    if (!trimmed) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const updated = await updateWorkspace(renameId, { name: trimmed });
      setWorkspaces(workspaces.map((w) => (w.id === renameId ? { ...w, name: updated.name } : w)));
      setRenameOpen(false);
      setRenameId(null);
      setRenameName('');
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : 'Failed to rename workspace');
    } finally {
      setRenaming(false);
    }
  };

  // ── Delete workspace ──────────────────────────────────────────────────────

  const handleDeleteWorkspace = async () => {
    if (!deleteId || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteWorkspace(deleteId);

      const remaining = workspaces.filter((w) => w.id !== deleteId);
      // Remove all channels for the deleted workspace.
      useAppStore.setState((s) => ({
        workspaces: remaining,
        channels: s.channels.filter((c) => c.workspaceId !== deleteId),
      }));

      // If the deleted workspace was active, navigate away.
      if (currentWorkspaceId === deleteId) {
        if (remaining.length === 0) {
          useAppStore.setState({ currentWorkspaceId: null, currentChannelId: null, messages: [] });
          navigate('/app');
        } else {
          const dest = await resolveWorkspaceChannel(remaining[0].id);
          if (dest) {
            navigate(`/app/${dest.workspaceId}/${dest.channelId}`);
          } else {
            navigate('/app');
          }
        }
      }

      setDeleteOpen(false);
      setDeleteId(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete workspace');
    } finally {
      setDeleting(false);
    }
  };

  // ── Join workspace by code ────────────────────────────────────────────────

  const handleJoinByCode = async () => {
    if (joining) return;
    const raw = joinCode.trim();
    if (!raw) return;
    setJoining(true);
    setJoinError(null);
    try {
      const { workspace } = await joinWorkspaceByCode(raw.toUpperCase());
      // Dedupe and add workspace to the list.
      useAppStore.setState((s) => ({
        workspaces: [
          ...s.workspaces.filter((w) => w.id !== workspace.id),
          workspace,
        ],
      }));

      const dest = await resolveWorkspaceChannel(workspace.id);
      if (dest) {
        navigate(`/app/${dest.workspaceId}/${dest.channelId}`);
      }

      setJoinOpen(false);
      setJoinCode('');
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Failed to join workspace');
    } finally {
      setJoining(false);
    }
  };

  const workspaceToDelete = workspaces.find((w) => w.id === deleteId);
  const workspaceToRename = workspaces.find((w) => w.id === renameId);

  return (
    <>
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
                <div className="text-2xs text-text-tertiary">Workspace</div>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-text-tertiary" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {workspaces.map((workspace) => {
            const isOwner = user && workspace.ownerId === user.id;
            return (
              <div key={workspace.id} className="flex items-center group">
                <DropdownMenuItem
                  onSelect={() => void handleSwitchWorkspace(workspace)}
                  disabled={switching}
                  className="flex-1 flex items-center gap-3 py-2"
                >
                  <span className="font-medium truncate">{workspace.name}</span>
                </DropdownMenuItem>

                {isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-40">
                      <DropdownMenuItem
                        onSelect={() => {
                          setRenameId(workspace.id);
                          setRenameName(workspace.name);
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
                        onSelect={() => {
                          setDeleteId(workspace.id);
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
                )}
              </div>
            );
          })}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="flex items-center gap-3 py-2 text-muted-foreground"
            onSelect={() => {
              setCreateOpen(true);
              setNewName('');
              setCreateError(null);
            }}
          >
            <div className="w-7 h-7 rounded-md border border-dashed border-border flex items-center justify-center">
              <Plus className="w-3.5 h-3.5" />
            </div>
            <span>New Workspace</span>
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
      </DropdownMenu>

      {/* Create Workspace Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>Give your workspace a name. You can change it later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-workspace-name">Workspace name</Label>
            <Input
              id="new-workspace-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. My Team"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && void handleCreateWorkspace()}
            />
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreateWorkspace()} disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Workspace Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription>Enter a new name for "{workspaceToRename?.name}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-workspace">New name</Label>
            <Input
              id="rename-workspace"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && void handleRenameWorkspace()}
            />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void handleRenameWorkspace()}
              disabled={renaming || !renameName.trim()}
            >
              {renaming ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workspace</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{workspaceToDelete?.name}"? All channels and messages
              will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteWorkspace()}
              disabled={deleting}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Join Workspace Dialog */}
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
              onKeyDown={(e) => e.key === 'Enter' && void handleJoinByCode()}
            />
            {joinError && <p className="text-sm text-destructive">{joinError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleJoinByCode()} disabled={joining || !joinCode.trim()}>
              {joining ? 'Joining…' : 'Join'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
