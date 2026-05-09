import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getSupabase } from '@/lib/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setHasSession(!!session);
        setAuthError(null);
      })
      .catch((error: unknown) => {
        setHasSession(false);
        setAuthError(error instanceof Error ? error.message : 'Failed to verify your session.');
      })
      .finally(() => {
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
      setAuthError(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-2">
          <p className="text-destructive">{authError}</p>
          <p className="text-sm text-muted-foreground">Please refresh and try again.</p>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
