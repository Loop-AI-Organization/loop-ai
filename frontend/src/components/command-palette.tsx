import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Hash, MessageSquare, ArrowRight } from 'lucide-react';
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
    currentWorkspaceId,
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

  const filteredChannels = useMemo(() => {
    if (!search) return workspaceChannels;
    return workspaceChannels.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [workspaceChannels, search]);

  const handleChannelSelect = (channelId: string) => {
    setCommandPaletteOpen(false);
    if (currentWorkspaceId) {
      navigate(`/app/${currentWorkspaceId}/${channelId}`);
    }
  };

  return (
    <CommandDialog 
      open={isCommandPaletteOpen} 
      onOpenChange={setCommandPaletteOpen}
    >
      <CommandInput 
        placeholder="Search channels or type a command..." 
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading="Quick Actions">
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
      </CommandList>
    </CommandDialog>
  );
}
