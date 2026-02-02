import { Hash, MessageCircle, Pin } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export function ChannelList() {
  const { channels, currentWorkspaceId, currentChannelId, setCurrentChannel } = useAppStore();
  
  const workspaceChannels = channels.filter(c => c.workspaceId === currentWorkspaceId);
  const projectChannels = workspaceChannels.filter(c => c.type === 'project');
  const dmChannels = workspaceChannels.filter(c => c.type === 'dm');

  return (
    <ScrollArea className="flex-1">
      <div className="p-2 space-y-4">
        {/* Project Channels */}
        <ChannelGroup
          title="Project Channels"
          channels={projectChannels}
          currentChannelId={currentChannelId}
          onSelect={setCurrentChannel}
          icon={Hash}
        />

        {/* Direct Messages */}
        <ChannelGroup
          title="Direct Messages"
          channels={dmChannels}
          currentChannelId={currentChannelId}
          onSelect={setCurrentChannel}
          icon={MessageCircle}
          showAvatar
        />

        {/* Pinned - empty state */}
        <div className="px-2">
          <div className="flex items-center gap-2 px-2 py-1.5 text-2xs font-medium text-text-tertiary uppercase tracking-wider">
            <Pin className="w-3 h-3" />
            Pinned
          </div>
          <div className="px-2 py-3 text-xs text-text-tertiary">
            No pinned conversations
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

interface ChannelGroupProps {
  title: string;
  channels: Array<{
    id: string;
    name: string;
    unreadCount: number;
    avatar?: string;
  }>;
  currentChannelId: string | null;
  onSelect: (id: string) => void;
  icon: React.ComponentType<{ className?: string }>;
  showAvatar?: boolean;
}

function ChannelGroup({ title, channels, currentChannelId, onSelect, icon: Icon, showAvatar }: ChannelGroupProps) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-1.5 text-2xs font-medium text-text-tertiary uppercase tracking-wider">
        {title}
      </div>
      <div className="space-y-0.5">
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onSelect(channel.id)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors',
              'hover:bg-sidebar-accent',
              currentChannelId === channel.id
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground'
            )}
          >
            {showAvatar && channel.avatar ? (
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-2xs font-medium text-muted-foreground">
                {channel.avatar}
              </div>
            ) : (
              <Icon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
            )}
            <span className="truncate flex-1 text-left">{channel.name}</span>
            {channel.unreadCount > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-2xs font-medium flex items-center justify-center">
                {channel.unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
