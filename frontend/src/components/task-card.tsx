import { useState } from 'react';
import { Check, X, ChevronDown, Calendar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { confirmTaskViaApi, deleteTaskViaApi, updateTaskViaApi } from '@/lib/supabase-data';
import { useAppStore } from '@/store/app-store';
import type { Task, TaskStatus } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<TaskStatus, string> = {
  proposed: 'Proposed',
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  proposed: 'bg-muted text-muted-foreground border-border',
  open: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
  in_progress: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  done: 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400',
  blocked: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
};

const NEXT_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done', 'blocked'];

// Deterministic hue from a string so each person gets a consistent colour
function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AssigneeAvatar({ displayName }: { displayName: string }) {
  const hue = nameToHue(displayName);
  return (
    <div
      className="w-5 h-5 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-semibold text-white flex-shrink-0"
      style={{ backgroundColor: `hsl(${hue},55%,48%)` }}
      title={displayName}
    >
      {initials(displayName)}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  compact?: boolean;
}

export function TaskCard({ task, compact = false }: TaskCardProps) {
  const { upsertTask, removeTask } = useAppStore();
  const [busy, setBusy] = useState<'confirm' | 'reject' | 'status' | null>(null);

  const isProposed = task.status === 'proposed';

  const handleConfirm = async () => {
    setBusy('confirm');
    try {
      const updated = await confirmTaskViaApi(task.id);
      upsertTask(updated);
    } catch (e) {
      console.error('Failed to confirm task:', e);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setBusy('reject');
    try {
      await deleteTaskViaApi(task.id);
      removeTask(task.id);
    } catch (e) {
      console.error('Failed to reject task:', e);
    } finally {
      setBusy(null);
    }
  };

  const handleStatusChange = async (status: TaskStatus) => {
    setBusy('status');
    try {
      const updated = await updateTaskViaApi(task.id, { status });
      upsertTask(updated);
    } catch (e) {
      console.error('Failed to update task status:', e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border bg-muted/30 my-1',
        isProposed && 'border-dashed border-primary/40 bg-primary/5',
        !isProposed && 'border-border',
        compact ? 'p-2.5' : 'p-3'
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Status badge / dropdown */}
        <div className="flex-shrink-0 mt-0.5">
          {isProposed ? (
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full border font-medium', STATUS_COLORS.proposed)}>
              Proposed
            </span>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={busy === 'status'}>
                <button
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 transition-opacity',
                    STATUS_COLORS[task.status],
                    busy === 'status' && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  {busy === 'status' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      {STATUS_LABELS[task.status]}
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                {NEXT_STATUSES.filter((s) => s !== task.status).map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => handleStatusChange(s)}>
                    <span className={cn('text-xs font-medium mr-2 px-1.5 py-0.5 rounded-full border', STATUS_COLORS[s])}>
                      {STATUS_LABELS[s]}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <p className={cn('font-medium leading-snug', compact ? 'text-xs' : 'text-sm', task.status === 'done' && 'line-through text-muted-foreground')}>
            {task.title}
          </p>

          {!compact && task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {task.assignees.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-1.5">
                  {task.assignees.slice(0, 4).map((a) => (
                    <AssigneeAvatar key={a.displayName} displayName={a.displayName} />
                  ))}
                  {task.assignees.length > 4 && (
                    <div className="w-5 h-5 rounded-full bg-muted border border-background flex items-center justify-center text-2xs font-medium text-muted-foreground">
                      +{task.assignees.length - 4}
                    </div>
                  )}
                </div>
                {!compact && (
                  <span className="text-xs text-muted-foreground">
                    {task.assignees.map((a) => a.displayName).join(', ')}
                  </span>
                )}
              </div>
            )}
            {task.dueDate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>{task.dueDate.toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Proposed actions */}
        {isProposed && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-500/10"
              onClick={handleConfirm}
              disabled={busy !== null}
              title="Add to board"
            >
              {busy === 'confirm' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={handleReject}
              disabled={busy !== null}
              title="Dismiss"
            >
              {busy === 'reject' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>

      {isProposed && (
        <p className="text-2xs text-muted-foreground mt-2 pl-0.5">
          Add this to the taskboard?
        </p>
      )}
    </div>
  );
}
