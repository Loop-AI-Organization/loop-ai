import { 
  Search, 
  Brain, 
  FileText, 
  Bookmark, 
  Calendar, 
  CalendarPlus, 
  Mail, 
  CheckSquare,
  Loader2,
  Check,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Action } from '@/types';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  search: Search,
  brain: Brain,
  'file-text': FileText,
  bookmark: Bookmark,
  calendar: Calendar,
  'calendar-plus': CalendarPlus,
  mail: Mail,
  'check-square': CheckSquare,
};

interface ActionChipProps {
  action: Action;
  compact?: boolean;
}

export function ActionChip({ action, compact }: ActionChipProps) {
  const Icon = action.icon ? iconMap[action.icon] || Brain : Brain;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all',
        action.status === 'pending' && 'bg-muted border-border text-muted-foreground',
        action.status === 'running' && 'bg-accent-info/10 border-accent-info/30 text-accent-info',
        action.status === 'completed' && 'bg-accent-success/10 border-accent-success/30 text-accent-success',
        action.status === 'failed' && 'bg-accent-error/10 border-accent-error/30 text-accent-error'
      )}
    >
      <StatusIcon status={action.status} Icon={Icon} />
      {!compact && <span className="truncate max-w-32">{action.label}</span>}
    </div>
  );
}

function StatusIcon({ 
  status, 
  Icon 
}: { 
  status: Action['status']; 
  Icon: React.ComponentType<{ className?: string }>;
}) {
  switch (status) {
    case 'pending':
      return <Icon className="w-3 h-3" />;
    case 'running':
      return <Loader2 className="w-3 h-3 animate-spin" />;
    case 'completed':
      return <Check className="w-3 h-3" />;
    case 'failed':
      return <AlertCircle className="w-3 h-3" />;
  }
}

interface ActionChipsBarProps {
  actions: Action[];
}

export function ActionChipsBar({ actions }: ActionChipsBarProps) {
  const visibleActions = actions.filter(a => 
    a.status === 'running' || a.status === 'pending'
  ).slice(0, 4);

  if (visibleActions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-muted/30">
      <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">
        Actions
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {visibleActions.map(action => (
          <ActionChip key={action.id} action={action} />
        ))}
      </div>
    </div>
  );
}
