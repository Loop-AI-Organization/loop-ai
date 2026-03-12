import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Hash, MessageSquare } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

export function CommandPalette() {
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    channels,
    threads,
    currentWorkspaceId,
    setCurrentChannel,
    setCurrentThread,
  } = useAppStore();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');

  // Reset search when opening
  useEffect(() => {
    if (isCommandPaletteOpen) {
      setSearch('');
    }
  }, [isCommandPaletteOpen]);

  const workspaceChannels = useMemo(() => 
    channels.filter(c => c.workspaceId === currentWorkspaceId),
    [channels, currentWorkspaceId]
  );

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const filteredProjectChannels = useMemo(() => {
    return workspaceChannels.filter((c) => {
      if (c.type !== 'project') return false;
      if (!normalizedSearch) return true;
      return c.name.toLowerCase().includes(normalizedSearch);
    });
  }, [workspaceChannels, normalizedSearch]);

  const filteredDmChannels = useMemo(() => {
    return workspaceChannels.filter((c) => {
      if (c.type !== 'dm') return false;
      if (!normalizedSearch) return true;
      return c.name.toLowerCase().includes(normalizedSearch);
    });
  }, [workspaceChannels, normalizedSearch]);

  const workspaceChannelIds = useMemo(
    () => new Set(workspaceChannels.map((channel) => channel.id)),
    [workspaceChannels]
  );

  const filteredThreads = useMemo(() => {
    const workspaceThreads = threads.filter((thread) => workspaceChannelIds.has(thread.channelId));
    if (!normalizedSearch) return workspaceThreads.slice(0, 10);
    return workspaceThreads.filter((thread) =>
      thread.title.toLowerCase().includes(normalizedSearch)
    );
  }, [threads, workspaceChannelIds, normalizedSearch]);

  const handleChannelSelect = (channelId: string) => {
    setCurrentChannel(channelId);
    setCommandPaletteOpen(false);
    if (currentWorkspaceId) {
      navigate(`/app/${currentWorkspaceId}/${channelId}`);
    }
  };

  const handleThreadSelect = (thread: { id: string; channelId: string }) => {
    setCurrentChannel(thread.channelId);
    setCurrentThread(thread.id);
    setCommandPaletteOpen(false);
    if (currentWorkspaceId) {
      navigate(`/app/${currentWorkspaceId}/${thread.channelId}`);
    }
  };

  const hasProjectChannels = filteredProjectChannels.length > 0;
  const hasDmChannels = filteredDmChannels.length > 0;
  const hasThreads = filteredThreads.length > 0;

  return (
    <CommandDialog 
      open={isCommandPaletteOpen} 
      onOpenChange={setCommandPaletteOpen}
    >
      <CommandInput 
        placeholder="Search channels, DMs, or threads..." 
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Project channels */}
        {hasProjectChannels && (
          <CommandGroup heading="Channels">
            {filteredProjectChannels.map((channel) => (
              <CommandItem 
                key={channel.id}
                onSelect={() => handleChannelSelect(channel.id)}
              >
                <Hash className="mr-2 h-4 w-4" />
                <span>#{' '}{channel.name}</span>
                {channel.unreadCount > 0 && (
                  <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-2xs font-medium flex items-center justify-center">
                    {channel.unreadCount}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hasProjectChannels && (hasDmChannels || hasThreads) && <CommandSeparator />}

        {/* Direct messages */}
        {hasDmChannels && (
          <CommandGroup heading="Direct Messages">
            {filteredDmChannels.map((channel) => (
              <CommandItem 
                key={channel.id}
                onSelect={() => handleChannelSelect(channel.id)}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                <span>{channel.name}</span>
                {channel.unreadCount > 0 && (
                  <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-2xs font-medium flex items-center justify-center">
                    {channel.unreadCount}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hasDmChannels && hasThreads && <CommandSeparator />}

        {/* Threads */}
        {hasThreads && (
          <CommandGroup heading="Threads">
            {filteredThreads.map((thread) => (
              <CommandItem 
                key={thread.id}
                onSelect={() => handleThreadSelect(thread)}
              >
                <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="truncate">{thread.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {thread.messageCount} messages
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
