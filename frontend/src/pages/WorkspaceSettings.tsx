import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/app-store';
import { ArrowLeft, Trash2, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  deleteWorkspace,
  fetchChannels,
  updateWorkspace,
  fetchWorkspaceMemberProfiles,
  getWorkspaceShareCode,
  rotateWorkspaceShareCode,
  removeWorkspaceMember,
} from '@/lib/supabase-data';
import type { WorkspaceMember } from '@/types';

export default function WorkspaceSettings() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const { workspaces, user, currentChannelId, channels, setWorkspaces } = useAppStore();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const isOwner = workspace && user && workspace.ownerId === user.id;

  // ── Back navigation ────────────────────────────────────────────────────────
  /**
   * Navigate back to the workspace that owns this settings page.
   * We never call setCurrentWorkspace / setChannels here — WorkspaceChannel
   * handles that when the URL changes.
   */
  const navigateBackToWorkspace = async () => {
    if (!workspaceId) {
      navigate('/app');
      return;
    }

    // Try to stay on the channel the user was already on if it belongs here.
    const wsChannels = channels.filter((c) => c.workspaceId === workspaceId);
    const stayOn =
      currentChannelId && wsChannels.some((c) => c.id === currentChannelId)
        ? currentChannelId
        : null;

    if (stayOn) {
      navigate(`/app/${workspaceId}/${stayOn}`);
      return;
    }

    // Otherwise resolve general / first channel.
    let target =
      wsChannels.find((c) => c.name === 'general') ?? wsChannels[0] ?? null;

    if (!target) {
      // Channels not loaded yet — fetch them now.
      try {
        const fetched = await fetchChannels(workspaceId);
        useAppStore.getState().mergeChannels(workspaceId, fetched);
        target = fetched.find((c) => c.name === 'general') ?? fetched[0] ?? null;
      } catch {
        navigate('/app');
        return;
      }
    }

    if (target) {
      navigate(`/app/${workspaceId}/${target.id}`);
    } else {
      navigate('/app');
    }
  };

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (workspace) setName(workspace.name);
  }, [workspace]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    fetchWorkspaceMemberProfiles(workspaceId)
      .then((list) => { if (!cancelled) setMembers(list); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setShareLoading(true);
    setShareError(null);
    getWorkspaceShareCode(workspaceId)
      .then((code) => { if (!cancelled) setShareCode(code); })
      .catch((e) => {
        if (!cancelled)
          setShareError(e instanceof Error ? e.message : 'Failed to load share code');
      })
      .finally(() => { if (!cancelled) setShareLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);

  // Redirect if workspace doesn't exist.
  useEffect(() => {
    if (!workspace && workspaces.length > 0) navigate('/app');
  }, [workspace, workspaces.length, navigate]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRotateShareCode = async () => {
    if (!workspaceId) return;
    if (!window.confirm('Rotate share code? The old code will stop working.')) return;
    setRotating(true);
    setShareError(null);
    try {
      const code = await rotateWorkspaceShareCode(workspaceId);
      setShareCode(code);
      setCopied(false);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Failed to rotate share code');
    } finally {
      setRotating(false);
    }
  };

  const handleCopyShareCode = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!workspaceId) return;
    setRemoveError(null);
    try {
      await removeWorkspaceMember(workspaceId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Failed to remove member');
    }
  };

  const handleSaveGeneral = async () => {
    if (!workspaceId || !workspace) return;
    setSaving(true);
    try {
      const updated = await updateWorkspace(workspaceId, { name });
      setWorkspaces(workspaces.map((w) => (w.id === workspaceId ? { ...w, name: updated.name } : w)));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!workspaceId || !workspace) return;
    if (!window.confirm('Delete this workspace? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteWorkspace(workspaceId);
      const remaining = workspaces.filter((w) => w.id !== workspaceId);
      // Remove channels for deleted workspace.
      useAppStore.setState((s) => ({
        workspaces: remaining,
        channels: s.channels.filter((c) => c.workspaceId !== workspaceId),
      }));

      if (remaining.length === 0) {
        useAppStore.setState({ currentWorkspaceId: null, currentChannelId: null, messages: [] });
        navigate('/app');
      } else {
        // Find a destination in another workspace.
        const other = remaining[0];
        const { mergeChannels } = useAppStore.getState();
        let otherChannels = useAppStore
          .getState()
          .channels.filter((c) => c.workspaceId === other.id);
        if (otherChannels.length === 0) {
          otherChannels = await fetchChannels(other.id);
          mergeChannels(other.id, otherChannels);
        }
        const dest = otherChannels.find((c) => c.name === 'general') ?? otherChannels[0];
        if (dest) {
          navigate(`/app/${other.id}/${dest.id}`);
        } else {
          navigate('/app');
        }
      }
    } finally {
      setDeleting(false);
    }
  };

  if (!workspace) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-4 gap-4">
        <Button variant="ghost" size="icon" onClick={() => void navigateBackToWorkspace()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="font-semibold">Workspace Settings</h1>
          <p className="text-sm text-muted-foreground">{workspace.name}</p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-6 space-y-8">
        {/* General */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">General</h2>
          <div className="space-y-4 p-5 rounded-lg border border-border">
            <div className="space-y-2">
              <Label>Workspace name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
            </div>
            <Button onClick={() => void handleSaveGeneral()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </section>

        <Separator />

        {/* Members */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Members</h2>
          <div className="p-5 rounded-lg border border-border space-y-4">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <div className="space-y-3">
                {members.map((m) => (
                  <div key={m.id} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                      {(m.displayName ?? m.email ?? '').slice(0, 2).toUpperCase() || '??'}
                    </div>
                    <p className="text-sm font-medium truncate min-w-0">
                      {m.displayName ?? m.email ?? 'User'}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded capitalize">
                        {m.role}
                      </span>
                      {isOwner && m.role !== 'owner' && (
                        <Button
                          variant="outline"
                          size="xs"
                          className="text-xs"
                          onClick={() => void handleRemoveMember(m.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {removeError && <p className="text-sm text-destructive">{removeError}</p>}
          </div>
        </section>

        <Separator />

        {/* Share code */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Share</h2>
          <div className="space-y-3 p-5 rounded-lg border border-border">
            <p className="text-sm text-muted-foreground">
              Share this code with teammates so they can join this workspace from their account.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="px-3 py-1.5 rounded-md bg-muted font-mono text-sm tracking-[0.2em] min-w-[7rem] text-center">
                {shareLoading ? 'Loading…' : shareCode ?? '—'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopyShareCode()}
                  disabled={!shareCode || shareLoading}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRotateShareCode()}
                  disabled={shareLoading || rotating}
                >
                  {rotating ? 'Rotating…' : 'Regenerate'}
                </Button>
              </div>
            </div>
            {shareError && <p className="text-sm text-destructive">{shareError}</p>}
          </div>
        </section>

        {/* Privacy */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Privacy</h2>
          <div className="space-y-4 p-5 rounded-lg border border-border">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Globe className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label>Public workspace</Label>
                  <p className="text-xs text-muted-foreground">Anyone can join</p>
                </div>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label>Require approval</Label>
                  <p className="text-xs text-muted-foreground">New members need approval</p>
                </div>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </section>

        <Separator />

        {/* Danger Zone */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          <div className="p-5 rounded-lg border border-destructive/30 bg-destructive/5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Delete workspace</p>
                <p className="text-xs text-muted-foreground">This action cannot be undone</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => void handleDeleteWorkspace()}
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
