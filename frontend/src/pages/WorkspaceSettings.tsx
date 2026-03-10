import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/app-store';
import { ArrowLeft, Users, Trash2, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  deleteWorkspace,
  fetchChannels,
  updateWorkspace,
  fetchWorkspaceMembers,
  getWorkspaceShareCode,
  rotateWorkspaceShareCode,
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

  const workspace = workspaces.find(w => w.id === workspaceId);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
    }
  }, [workspace?.id, workspace?.name]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    fetchWorkspaceMembers(workspaceId).then((list) => {
      if (!cancelled) setMembers(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [workspaceId]);
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setShareLoading(true);
    setShareError(null);
    getWorkspaceShareCode(workspaceId)
      .then((code) => {
        if (!cancelled) setShareCode(code);
      })
      .catch((e) => {
        if (!cancelled) setShareError(e instanceof Error ? e.message : 'Failed to load share code');
      })
      .finally(() => {
        if (!cancelled) setShareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

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

  const handleSaveGeneral = async () => {
    if (!workspaceId || !workspace) return;
    setSaving(true);
    try {
      const updated = await updateWorkspace(workspaceId, { name });
      setWorkspaces(workspaces.map(w => w.id === workspaceId ? { ...w, name: updated.name } : w));
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
      setWorkspaces(remaining);
      if (currentWorkspaceId === workspaceId) {
        if (remaining.length === 0) {
          setChannels([]);
          setThreads([]);
          setMessages([]);
          useAppStore.setState({ currentWorkspaceId: null, currentChannelId: null, currentThreadId: null });
          navigate('/app');
        } else {
          const other = remaining[0];
          const channels = await fetchChannels(other.id);
          setCurrentWorkspace(other.id);
          setChannels(channels);
          const firstChannelId = channels[0]?.id;
          if (firstChannelId) {
            setCurrentChannel(firstChannelId);
            setCurrentThread(null);
            setThreads([]);
            setMessages([]);
            navigate(`/app/${other.id}/${firstChannelId}`);
          } else {
            setThreads([]);
            setMessages([]);
            useAppStore.setState({ currentChannelId: null, currentThreadId: null });
            navigate('/app');
          }
        }
      }
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!workspace) {
      navigate('/app');
      return;
    }
    setCurrentWorkspace(workspaceId!);
  }, [workspaceId, workspace, setCurrentWorkspace, navigate]);

  if (!workspace) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-4 gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate('/app')}
        >
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
            <Button onClick={handleSaveGeneral} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </section>

        <Separator />

        {/* Members */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Members</h2>
          </div>
          <div className="p-5 rounded-lg border border-border space-y-4">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <div className="space-y-3">
                {members.map((m) => (
                  <div key={m.id} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                      {m.userId.slice(0, 2).toUpperCase()}
                    </div>
                    <p className="text-sm font-medium truncate min-w-0">{m.email ?? m.userId}</p>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded capitalize shrink-0">{m.role}</span>
                  </div>
                ))}
              </div>
            )}
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
                  onClick={handleCopyShareCode}
                  disabled={!shareCode || shareLoading}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRotateShareCode}
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
                <p className="text-xs text-muted-foreground">
                  This action cannot be undone
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={handleDeleteWorkspace}
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
