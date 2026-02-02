import { useParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { ArrowLeft, Users, Trash2, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

export default function WorkspaceSettings() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { workspaces, setCurrentWorkspace } = useAppStore();
  const navigate = useNavigate();

  const workspace = workspaces.find(w => w.id === workspaceId);

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
          <h2 className="text-lg font-medium">General</h2>
          <div className="space-y-4 p-4 rounded-lg border border-border">
            <div className="space-y-2">
              <Label>Workspace name</Label>
              <Input defaultValue={workspace.name} />
            </div>
            <div className="space-y-2">
              <Label>Workspace icon</Label>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center text-xl font-semibold text-primary-foreground">
                  {workspace.icon}
                </div>
                <Button variant="outline" size="sm">Change</Button>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Members */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Members</h2>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Users className="w-4 h-4" />
              Invite
            </Button>
          </div>
          <div className="p-4 rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                AC
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Alex Chen</p>
                <p className="text-xs text-muted-foreground">alex@loop.ai</p>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Owner</span>
            </div>
          </div>
        </section>

        <Separator />

        {/* Privacy */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Privacy</h2>
          <div className="space-y-4 p-4 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label>Public workspace</Label>
                  <p className="text-xs text-muted-foreground">Anyone can join</p>
                </div>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground" />
                <div>
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
          <h2 className="text-lg font-medium text-destructive">Danger Zone</h2>
          <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delete workspace</p>
                <p className="text-xs text-muted-foreground">
                  This action cannot be undone
                </p>
              </div>
              <Button variant="destructive" size="sm" className="gap-1.5">
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
