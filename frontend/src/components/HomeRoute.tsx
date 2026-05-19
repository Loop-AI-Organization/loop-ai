import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getSupabase } from '@/lib/supabase';
import Landing from '@/pages/Landing';

export function HomeRoute() {
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
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

  if (hasSession) {
    return <Navigate to="/app" replace />;
  }

  return <Landing />;
}