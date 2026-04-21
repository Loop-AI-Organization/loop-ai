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

  const workspaceChannels = useMemo(
    () => channels.filter((c) => c.workspaceId === currentWorkspaceId),
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

  const filteredMembers = useMemo(() => {
    if (!normalizedSearch) return dmMembers;
    return dmMembers.filter((member) => {
      const haystack = `${member.displayName ?? ''} ${member.email ?? ''}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [dmMembers, normalizedSearch]);

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

  const hasProjectChannels = filteredProjectChannels.length > 0;
  const hasDmChannels = filteredDmChannels.length > 0;

  return (
    <CommandDialog open={isCommandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput
        placeholder="Search channels, DMs, or commands..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick Actions">
          <CommandItem
            onSelect={() => {
              const composer = document.querySelector('[data-composer-input]') as HTMLTextAreaElement;
              composer?.focus();
              setCommandPaletteOpen(false);
            }}
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            <span>Focus Composer</span>
            <kbd className="ml-auto kbd">⌘/</kbd>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

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

        {(hasProjectChannels || hasDmChannels) && <CommandSeparator />}

        {hasProjectChannels && (
          <CommandGroup heading="Channels">
            {filteredProjectChannels.map((channel) => (
              <CommandItem key={channel.id} onSelect={() => handleChannelSelect(channel.id)}>
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

        {hasProjectChannels && hasDmChannels && <CommandSeparator />}

        {hasDmChannels && (
          <CommandGroup heading="Direct Messages">
            {filteredDmChannels.map((channel) => (
              <CommandItem key={channel.id} onSelect={() => handleChannelSelect(channel.id)}>
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
      </CommandList>
    </CommandDialog>
  );
}
