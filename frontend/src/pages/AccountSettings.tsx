import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/app-store';
import { getSupabase } from '@/lib/supabase';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { updateAccountProfile } from '@/lib/supabase-data';
import type { User } from '@/types';

function authUserToUser(user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null): User | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
    email: user.email ?? '',
    status: 'online',
  };
}

export default function AccountSettings() {
  const navigate = useNavigate();
  const { user, setUser } = useAppStore();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!user);
  const [error, setError] = useState<string | null>(null);

  // Ensure user is loaded (e.g. when navigating directly to /app/account)
  useEffect(() => {
    if (user) {
      setDisplayName(user.name);
      setLoading(false);
      return;
    }
    let cancelled = false;
    getSupabase().auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session?.user) {
        setUser(authUserToUser(session.user));
      }
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user, setUser]);

  useEffect(() => {
    if (user) setDisplayName(user.name);
  }, [user?.id, user?.name]);

  const handleSave = async () => {
    if (!user || !displayName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateAccountProfile(displayName.trim());
      setUser({ ...user, name: displayName.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

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
          <h1 className="font-semibold">Account Settings</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-6 space-y-8">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Profile</h2>
          <div className="space-y-4 p-5 rounded-lg border border-border">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="w-full bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed here. Contact support if needed.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleSave} disabled={saving || displayName.trim() === user.name}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
