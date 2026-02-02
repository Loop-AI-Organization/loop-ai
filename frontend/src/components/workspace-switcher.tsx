import { ChevronDown, Plus } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export function WorkspaceSwitcher() {
  const { workspaces, currentWorkspaceId, setCurrentWorkspace } = useAppStore();
  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="w-full justify-between px-3 py-2 h-auto hover:bg-sidebar-accent"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm">
              {currentWorkspace?.icon || '◎'}
            </div>
            <div className="text-left">
              <div className="font-medium text-sm text-sidebar-foreground">
                {currentWorkspace?.name || 'Select Workspace'}
              </div>
              <div className="text-2xs text-text-tertiary">
                Workspace
              </div>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-text-tertiary" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => setCurrentWorkspace(workspace.id)}
            className="flex items-center gap-3 py-2"
          >
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-semibold text-xs">
              {workspace.icon}
            </div>
            <span className="font-medium">{workspace.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem className="flex items-center gap-3 py-2 text-muted-foreground">
          <div className="w-7 h-7 rounded-md border border-dashed border-border flex items-center justify-center">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span>New Workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
