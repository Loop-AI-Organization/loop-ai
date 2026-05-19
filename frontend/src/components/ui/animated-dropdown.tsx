'use client';

import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

// Generic workspace interface - can be extended
export interface Workspace {
    id: string;
    name: string;
    [key: string]: any; // Allow additional properties
}

interface AnimatedDropdownProps {
    workspaces: Workspace[];
    selectedWorkspaceId?: string;
    onWorkspaceChange: (workspace: Workspace) => void;
    triggerClassName?: string;
    contentClassName?: string;
}

function AnimatedDropdown({
    workspaces,
    selectedWorkspaceId,
    onWorkspaceChange,
    triggerClassName,
    contentClassName,
}: AnimatedDropdownProps) {
    const [open, setOpen] = React.useState(false);

    const selectedWorkspace = React.useMemo(() => {
        if (!selectedWorkspaceId) return workspaces[0];
        return (
            workspaces.find((ws) => ws.id === selectedWorkspaceId) ||
            workspaces[0]
        );
    }, [workspaces, selectedWorkspaceId]);

    const handleWorkspaceSelect = (workspace: Workspace) => {
        onWorkspaceChange(workspace);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        'rounded-lg shadow-sm shadow-black/5 h-9 px-4 py-2 min-w-48 bg-gradient-to-r from-[#40bfae]/15 via-[#40bfae]/10 to-[#7dd3c0]/15 border border-[#40bfae]/20 text-[#40bfae] hover:from-[#40bfae]/25 hover:via-[#40bfae]/20 hover:to-[#7dd3c0]/25 transition-all duration-300 flex items-center gap-2',
                        triggerClassName
                    )}
                >
                    {selectedWorkspace && (
                        <>
                            <Avatar className="h-5 w-5">
                                <AvatarImage
                                    src={(selectedWorkspace as any).logo}
                                    alt={selectedWorkspace.name}
                                />
                                <AvatarFallback className="text-[10px] bg-[#40bfae]/20 text-[#40bfae]">
                                    {selectedWorkspace.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <span className="truncate flex-1 text-left">
                                {selectedWorkspace.name}
                            </span>
                        </>
                    )}
                    <ChevronsUpDownIcon className="h-4 w-4 shrink-0 opacity-70" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                className={cn('p-0 w-[--radix-popover-trigger-width] max-h-[400px] overflow-y-auto', contentClassName)}
                align="start"
            >
                <div className="border-b px-3 py-2">
                    <p className="text-muted-foreground text-sm font-medium">Switch Workspace</p>
                </div>

                <div className="p-1">
                    {workspaces.map((workspace) => {
                        const isSelected = selectedWorkspace && selectedWorkspace.id === workspace.id;

                        return (
                            <button
                                key={workspace.id}
                                onClick={() => handleWorkspaceSelect(workspace)}
                                className={cn(
                                    'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
                                    'hover:bg-[#40bfae]/10 hover:text-[#40bfae]',
                                    'focus:outline-none focus:bg-[#40bfae]/10',
                                    isSelected && 'bg-[#40bfae]/15 text-[#40bfae]',
                                )}
                            >
                                <Avatar className="h-6 w-6">
                                    <AvatarImage
                                        src={(workspace as any).logo}
                                        alt={workspace.name}
                                    />
                                    <AvatarFallback className="text-xs bg-[#40bfae]/20 text-[#40bfae]">
                                        {workspace.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex min-w-0 flex-1 flex-col items-start">
                                    <span className={cn(
                                        'truncate text-sm',
                                        isSelected ? 'text-[#40bfae] font-medium' : '',
                                    )}>{workspace.name}</span>
                                    {(workspace as any).plan && (
                                        <span className="text-muted-foreground text-xs">
                                            {(workspace as any).plan}
                                        </span>
                                    )}
                                </div>
                                {isSelected && <CheckIcon className="ml-auto h-4 w-4 text-[#40bfae]" />}
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export { AnimatedDropdown };