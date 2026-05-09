import { Outlet } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAppData } from '@/hooks/use-app-data';

export function ProtectedAppBootstrap() {
  const { dataLoading, dataError } = useAppData();

  return (
    <ProtectedRoute>
      {dataLoading ? (
        <div className="h-screen flex items-center justify-center bg-background">
          <div className="animate-pulse text-muted-foreground">Loading your workspaces…</div>
        </div>
      ) : dataError ? (
        <div className="h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-2">
            <p className="text-destructive">{dataError}</p>
            <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </ProtectedRoute>
  );
}
