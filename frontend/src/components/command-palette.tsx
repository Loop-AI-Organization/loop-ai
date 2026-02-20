import { useState, useEffect, useMemo } from 'react';
import { Search, Hash, MessageSquare, Plus, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { createThread as createThreadInSupabase } from '@/lib/supabase-data';
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
    addThread,
    currentChannelId,
  } = useAppStore();
  const [creating, setCreating] = useState(false);

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

  const filteredChannels = useMemo(() => {
    if (!search) return workspaceChannels;
    return workspaceChannels.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [workspaceChannels, search]);

  const filteredThreads = useMemo(() => {
    if (!search) return threads.slice(0, 5);
    return threads.filter(t => 
      t.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [threads, search]);

  const handleChannelSelect = (channelId: string) => {
    setCurrentChannel(channelId);
    setCommandPaletteOpen(false);
  };

  const handleThreadSelect = (threadId: string) => {
    setCurrentThread(threadId);
    setCommandPaletteOpen(false);
  };

  const handleNewThread = async () => {
    if (!currentWorkspaceId || !currentChannelId) return;
    setCreating(true);
    try {
      const thread = await createThreadInSupabase(
        currentWorkspaceId,
        currentChannelId,
        'Untitled thread'
      );
      addThread(thread);
      setCommandPaletteOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <CommandDialog 
      open={isCommandPaletteOpen} 
      onOpenChange={setCommandPaletteOpen}
    >
      <CommandInput 
        placeholder="Search channels, threads, or type a command..." 
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={handleNewThread} disabled={creating}>
            <Plus className="mr-2 h-4 w-4" />
            <span>{creating ? 'Creating…' : 'New Thread'}</span>
            <span className="ml-auto text-xs text-muted-foreground">in current channel</span>
          </CommandItem>
          <CommandItem onSelect={() => {
            const composer = document.querySelector('[data-composer-input]') as HTMLTextAreaElement;
            composer?.focus();
            setCommandPaletteOpen(false);
          }}>
            <ArrowRight className="mr-2 h-4 w-4" />
            <span>Focus Composer</span>
            <kbd className="ml-auto kbd">⌘/</kbd>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Channels */}
        <CommandGroup heading="Channels">
          {filteredChannels.map((channel) => (
            <CommandItem 
              key={channel.id}
              onSelect={() => handleChannelSelect(channel.id)}
            >
              {channel.type === 'project' ? (
                <Hash className="mr-2 h-4 w-4" />
              ) : (
                <MessageSquare className="mr-2 h-4 w-4" />
              )}
              <span>{channel.name}</span>
              {channel.unreadCount > 0 && (
                <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-2xs font-medium flex items-center justify-center">
                  {channel.unreadCount}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Threads */}
        <CommandGroup heading="Recent Threads">
          {filteredThreads.map((thread) => (
            <CommandItem 
              key={thread.id}
              onSelect={() => handleThreadSelect(thread.id)}
            >
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="truncate">{thread.title}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {thread.messageCount} messages
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
