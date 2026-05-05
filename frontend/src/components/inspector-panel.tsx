import { useState, useEffect } from 'react';
import { X, Clock, Brain, File, ListChecks, FileText, Bookmark, BotOff } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { fetchWorkspaceFiles, fetchChannelTasks, updateChannelSettings } from '@/lib/supabase-data';
import { getSupabase } from '@/lib/supabase';
import type { Action, FileRecord, Task } from '@/types';
import { FileCard } from '@/components/file-card';
import { TaskCard } from '@/components/task-card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ActionChip } from './action-chip';
import { cn } from '@/lib/utils';

export function InspectorPanel() {
  const {
    isInspectorOpen,
    toggleInspector,
    actions,
    channels,
    currentChannelId,
    currentWorkspaceId,
    contextItems,
    setChannels,
    tasks,
    setTasks,
    upsertTask,
    removeTask,
  } = useAppStore();
  const [workspaceFiles, setWorkspaceFiles] = useState<FileRecord[]>([]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const threadActions = currentChannelId ? actions : [];
  const currentChannel = channels.find((channel) => channel.id === currentChannelId) ?? null;

  async function saveChannelSettings(
    settings: { isLlmRestricted?: boolean; llmParticipationEnabled?: boolean }
  ) {
    if (!currentChannel) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const updated = await updateChannelSettings(currentChannel.id, settings);
      setChannels(channels.map((channel) => (
        channel.id === updated.id ? { ...channel, ...updated } : channel
      )));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update channel settings';
      setSettingsError(message);
    } finally {
      setSettingsSaving(false);
    }
  }

  useEffect(() => {
    if (!currentWorkspaceId) {
      setWorkspaceFiles([]);
      return;
    }
    let cancelled = false;
    fetchWorkspaceFiles(currentWorkspaceId).then((list) => {
      if (!cancelled) setWorkspaceFiles(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentWorkspaceId]);

  // Load tasks for current channel + realtime subscription
  useEffect(() => {
    if (!currentChannelId) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    fetchChannelTasks(currentChannelId).then((list) => {
      if (!cancelled) setTasks(list);
    }).catch(() => {});

    const supabase = getSupabase();
    const sub = supabase
      .channel(`tasks:channel:${currentChannelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `channel_id=eq.${currentChannelId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            removeTask((payload.old as { id: string }).id);
          } else {
            // Re-fetch to get assignees joined
            const id = (payload.new as { id: string }).id;
            supabase
              .from('tasks')
              .select('*, task_assignees(task_id, display_name, user_id, added_by, added_at)')
              .eq('id', id)
              .single()
              .then(({ data }) => {
                if (!data) return;
                const t: Task = {
                  id: data.id,
                  workspaceId: data.workspace_id,
                  channelId: data.channel_id,
                  title: data.title,
                  description: data.description,
                  status: data.status,
                  dueDate: data.due_date ? new Date(data.due_date) : null,
                  sourceMessageId: data.source_message_id,
                  createdBy: data.created_by,
                  createdAt: new Date(data.created_at),
                  updatedAt: new Date(data.updated_at),
                  assignees: (data.task_assignees ?? []).map((a: Record<string, unknown>) => ({
                    taskId: String(a.task_id ?? data.id),
                    displayName: String(a.display_name ?? ''),
                    userId: a.user_id as string | null,
                    addedBy: a.added_by as string | null,
                    addedAt: new Date(String(a.added_at ?? Date.now())),
                  })),
                };
                upsertTask(t);
              });
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(sub);
    };
  }, [currentChannelId]);

  const channelTasks = tasks.filter((t) => t.channelId === currentChannelId);
  const proposedTasks = channelTasks.filter((t) => t.status === 'proposed');
  const activeTasks = channelTasks.filter((t) => t.status !== 'proposed');

  if (!isInspectorOpen) return null;

  return (
    <>
      {/* Mobile overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={toggleInspector}
      />

      {/* Panel */}
      <aside className={cn(
        'fixed md:relative right-0 top-0 h-full z-50 md:z-auto',
        'w-80 border-l border-border bg-card flex flex-col',
        'animate-slide-in-right md:animate-none'
      )}>
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
          <h3 className="font-medium">Inspector</h3>
          <Button variant="ghost" size="icon" onClick={toggleInspector}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="context" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-10 px-2">
            <TabsTrigger value="context" className="text-xs data-[state=active]:bg-muted">
              <Brain className="w-3.5 h-3.5 mr-1.5" />
              Context
            </TabsTrigger>
            <TabsTrigger value="actions" className="text-xs data-[state=active]:bg-muted">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              Actions
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs data-[state=active]:bg-muted">
              <ListChecks className="w-3.5 h-3.5 mr-1.5" />
              Tasks
              {proposedTasks.length > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground text-2xs rounded-full px-1 min-w-[1rem] text-center leading-4">
                  {proposedTasks.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="files" className="text-xs data-[state=active]:bg-muted">
              <File className="w-3.5 h-3.5 mr-1.5" />
              Files
            </TabsTrigger>
          </TabsList>

          {/* Always-visible AI controls */}
          <div className="border-b border-border px-3 py-2 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs flex items-center gap-1.5">
                  <BotOff className="w-3.5 h-3.5" />
                  Restrict AI
                </Label>
                <p className="text-2xs text-muted-foreground">On: AI replies are blocked. Off: AI replies are allowed.</p>
              </div>
              <Switch
                checked={(currentChannel?.isLlmRestricted ?? false) || (currentChannel?.llmParticipationEnabled === false)}
                disabled={!currentChannel || settingsSaving}
                onCheckedChange={(checked) =>
                  saveChannelSettings({
                    isLlmRestricted: checked,
                    llmParticipationEnabled: !checked,
                  })
                }
              />
            </div>

            {settingsError && (
              <p className="text-2xs text-destructive">{settingsError}</p>
            )}
          </div>

          {/* Context Tab */}
          <TabsContent value="context" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Project memory and context loaded for this channel.
                </p>
                {contextItems.map((item) => (
                  <ContextCard key={item.id} item={item} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Actions Tab */}
          <TabsContent value="actions" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Actions triggered during this conversation.
                </p>
                {threadActions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No actions yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {threadActions.map((action) => (
                      <ActionTimelineItem key={action.id} action={action} />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                {channelTasks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No tasks yet — ask the AI to track something
                  </div>
                ) : (
                  <>
                    {proposedTasks.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Pending review
                        </p>
                        {proposedTasks.map((task) => (
                          <TaskCard key={task.id} task={task} />
                        ))}
                      </div>
                    )}
                    {activeTasks.length > 0 && (
                      <div className="space-y-1.5">
                        {proposedTasks.length > 0 && (
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Board
                          </p>
                        )}
                        {activeTasks.map((task) => (
                          <TaskCard key={task.id} task={task} compact />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Files Tab */}
          <TabsContent value="files" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Files in this workspace.
                </p>
                {workspaceFiles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No files yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {workspaceFiles.map((file) => (
                      <FileCard key={file.id} file={file} />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

        </Tabs>
      </aside>
    </>
  );
}

interface ContextCardProps {
  item: {
    id: string;
    title: string;
    content: string;
    type: 'memory' | 'summary' | 'document';
    updatedAt: Date;
  };
}

function ContextCard({ item }: ContextCardProps) {
  const iconMap = {
    memory: Brain,
    summary: FileText,
    document: Bookmark,
  };
  const Icon = iconMap[item.type];

  return (
    <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{item.title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {item.content}
      </p>
      <p className="text-2xs text-muted-foreground/60">
        Updated {item.updatedAt.toLocaleDateString()}
      </p>
    </div>
  );
}

interface ActionTimelineItemProps {
  action: Action;
}

function ActionTimelineItem({ action }: ActionTimelineItemProps) {
  return (
    <div className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
      <div className="mt-0.5">
        <ActionChip action={action} compact />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{action.label}</p>
        {action.output && (
          <p className="text-2xs text-muted-foreground truncate">{action.output}</p>
        )}
        {action.completedAt && (
          <p className="text-2xs text-muted-foreground/60">
            {formatDuration(action.startedAt, action.completedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function formatDuration(start?: Date, end?: Date): string {
  if (!start || !end) return '';
  const ms = end.getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
