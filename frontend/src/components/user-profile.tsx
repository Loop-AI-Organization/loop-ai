import { Settings, LogOut, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/hooks/use-theme';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase';

export function UserProfile() {
  const { user } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await getSupabase().auth.signOut();
    navigate('/login', { replace: true });
  };

  const initials = user ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?' : '…';

  return (
    <div className="p-3 border-t border-sidebar-border">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 px-2 py-2 h-auto hover:bg-sidebar-accent"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
                {initials}
              </div>
              {user && (
                <div
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-sidebar-background',
                    user.status === 'online' && 'bg-accent-success',
                    user.status === 'away' && 'bg-accent-warning',
                    user.status === 'offline' && 'bg-muted-foreground/40'
                  )}
                />
              )}
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="font-medium text-sm text-sidebar-foreground truncate">
                {user?.name ?? 'Loading…'}
              </div>
              <div className="text-2xs text-text-tertiary truncate">
                {user?.email ?? ''}
              </div>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={toggleTheme} className="flex items-center gap-2">
            {theme === 'light' ? (
              <>
                <Moon className="w-4 h-4" />
                <span>Dark Mode</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4" />
                <span>Light Mode</span>
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/app/account')} className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="flex items-center gap-2 text-destructive" onClick={handleSignOut}>
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
