import { useState } from 'react';
import { X, FileText, Clock, Settings2, Brain, Bookmark, File, Download, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
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
    currentThreadId,
    contextItems,
    files,
    threadSettings,
    updateThreadSettings,
  } = useAppStore();

  const threadActions = actions.filter(a => a.threadId === currentThreadId);

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
            <TabsTrigger value="files" className="text-xs data-[state=active]:bg-muted">
              <File className="w-3.5 h-3.5 mr-1.5" />
              Files
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs data-[state=active]:bg-muted">
              <Settings2 className="w-3.5 h-3.5 mr-1.5" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Context Tab */}
          <TabsContent value="context" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Project memory and context loaded for this thread.
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

          {/* Files Tab */}
          <TabsContent value="files" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Files uploaded to this thread.
                </p>
                {files.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No files uploaded
                  </div>
                ) : (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <FileCard key={file.id} file={file} />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6">
                <p className="text-xs text-muted-foreground">
                  Configure thread-specific settings.
                </p>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Mention-only mode</Label>
                      <p className="text-2xs text-muted-foreground">
                        Only respond when @mentioned
                      </p>
                    </div>
                    <Switch 
                      checked={threadSettings.mentionOnlyMode}
                      onCheckedChange={(checked) => 
                        updateThreadSettings({ mentionOnlyMode: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Respond only if unanswered</Label>
                      <p className="text-2xs text-muted-foreground">
                        Skip if a human already replied
                      </p>
                    </div>
                    <Switch 
                      checked={threadSettings.respondOnlyIfUnanswered}
                      onCheckedChange={(checked) => 
                        updateThreadSettings({ respondOnlyIfUnanswered: checked })
                      }
                    />
                  </div>
                </div>
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
  action: {
    id: string;
    label: string;
    status: 'queued' | 'running' | 'done' | 'error';
    startedAt?: Date;
    completedAt?: Date;
    output?: string;
  };
}

function ActionTimelineItem({ action }: ActionTimelineItemProps) {
  return (
    <div className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
      <div className="mt-0.5">
        <ActionChip action={action as any} compact />
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

interface FileCardProps {
  file: {
    id: string;
    name: string;
    size: number;
    type: string;
    uploadedAt: Date;
  };
}

function FileCard({ file }: FileCardProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
        <File className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-2xs text-muted-foreground">
          {formatFileSize(file.size)} • {file.uploadedAt.toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Download className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
