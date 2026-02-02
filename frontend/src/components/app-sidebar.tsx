import { WorkspaceSwitcher } from './workspace-switcher';
import { ChannelList } from './channel-list';
import { UserProfile } from './user-profile';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from './ui/button';

export function AppSidebar() {
  const { isSidebarOpen, toggleSidebar } = useAppStore();

  return (
    <>
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:relative z-50 h-full flex flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-200',
          'w-64 lg:w-64',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-0 lg:overflow-hidden'
        )}
      >
        {/* Close button (mobile) */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 lg:hidden"
          onClick={toggleSidebar}
        >
          <X className="w-4 h-4" />
        </Button>

        {/* Workspace Switcher */}
        <div className="p-3 border-b border-sidebar-border">
          <WorkspaceSwitcher />
        </div>

        {/* Channel List */}
        <ChannelList />

        {/* User Profile */}
        <UserProfile />
      </aside>
    </>
  );
}
