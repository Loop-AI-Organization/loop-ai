import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Hash, MessageSquare, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { launchDirectMessage, listDmCandidates } from '@/lib/dm';
import type { WorkspaceMember } from '@/types';
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
  const [dmMembers, setDmMembers] = useState<WorkspaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [startingDmFor, setStartingDmFor] = useState<string | null>(null);

  // Reset search when opening
  useEffect(() => {
    if (isCommandPaletteOpen) {
      setSearch('');
    }
  }, [isCommandPaletteOpen]);

  useEffect(() => {
    if (!isCommandPaletteOpen || !currentWorkspaceId) return;
    let cancelled = false;
    setLoadingMembers(true);
    setMembersError(null);
    listDmCandidates(currentWorkspaceId)
      .then((members) => {
        if (!cancelled) setDmMembers(members);
      })
      .catch((e) => {
        if (!cancelled) {
          setDmMembers([]);
          setMembersError(e instanceof Error ? e.message : 'Failed to load members');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMembers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isCommandPaletteOpen, currentWorkspaceId]);

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

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return dmMembers;
    return dmMembers.filter((member) => {
      const haystack = `${member.displayName ?? ''} ${member.email ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [dmMembers, search]);

  const handleChannelSelect = (channelId: string) => {
    setCommandPaletteOpen(false);
    if (currentWorkspaceId) {
      navigate(`/app/${currentWorkspaceId}/${channelId}`);
    }
  };

  const handleStartDm = async (otherUserId: string) => {
    if (!currentWorkspaceId || startingDmFor) return;
    setStartingDmFor(otherUserId);
    setMembersError(null);
    try {
      const channel = await launchDirectMessage(currentWorkspaceId, otherUserId);
      setCommandPaletteOpen(false);
      navigate(`/app/${currentWorkspaceId}/${channel.id}`);
    } catch (e) {
      setMembersError(e instanceof Error ? e.message : 'Failed to start direct message');
    } finally {
      setStartingDmFor(null);
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

        {/* Direct messages */}
        <CommandGroup heading="Start Direct Message">
          {loadingMembers ? (
            <CommandItem disabled>
              <span>Loading members...</span>
            </CommandItem>
          ) : filteredMembers.length > 0 ? (
            filteredMembers.map((member) => (
              <CommandItem
                key={member.id}
                onSelect={() => {
                  void handleStartDm(member.userId);
                }}
                disabled={startingDmFor !== null}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                <span>{member.displayName ?? member.email ?? 'User'}</span>
                {startingDmFor === member.userId && (
                  <span className="ml-auto text-xs text-muted-foreground">Opening...</span>
                )}
              </CommandItem>
            ))
          ) : (
            <CommandItem disabled>
              <span>No members found.</span>
            </CommandItem>
          )}
          {membersError && (
            <CommandItem disabled>
              <span>{membersError}</span>
            </CommandItem>
          )}
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
