import { Outlet } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAppData } from '@/hooks/use-app-data';
import LiquidLoading from '@/components/ui/liquid-loader';

export function ProtectedAppBootstrap() {
  const { dataLoading, dataError } = useAppData();

  return (
    <ProtectedRoute>
      {dataLoading ? (
        <div className="h-screen flex flex-col items-center justify-center bg-black">
          <LiquidLoading className="mb-4" />
          <p className="text-[#40bfae] text-sm">Loading your workspaces…</p>
        </div>
      ) : dataError ? (
        <div className="h-screen flex items-center justify-center bg-black p-4">
          <div className="text-center space-y-2">
            <p className="text-[#40bfae]">{dataError}</p>
            <p className="text-sm text-neutral-400">Check your connection and try again.</p>
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </ProtectedRoute>
  );
}
