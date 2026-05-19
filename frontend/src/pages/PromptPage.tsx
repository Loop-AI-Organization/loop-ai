"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Link, useLocation } from "react-router-dom";
import AnimatedGradientBackground from "@/components/ui/animated-gradient-background";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import { streamAssistant } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { Search, User, FolderOpen, MessageSquare, ArrowRight, Loader2, X, Check, Home, ChevronRight, MessageCircle } from "lucide-react";
import type { Message } from "@/types";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ToolCall {
  id: string;
  tool: string;
  status: "pending" | "running" | "completed" | "error";
  params: Record<string, string>;
  result?: string;
  options?: SearchResultOption[];
}

interface SearchResultOption {
  id: string;
  label: string;
  description: string;
  icon: "workspace" | "channel" | "file" | "message" | "user";
  action: () => void;
}

interface SuggestedAction {
  label: string;
  icon: React.ReactNode;
  action: string;
}

const quickActions: SuggestedAction[] = [
  { label: "Show my workspaces", icon: <FolderOpen className="w-4 h-4" />, action: "Show my workspaces" },
  { label: "Search for a file", icon: <Search className="w-4 h-4" />, action: "Search for a file" },
  { label: "Create a new channel", icon: <MessageSquare className="w-4 h-4" />, action: "Create a new channel" },
  { label: "Help me brainstorm", icon: <User className="w-4 h-4" />, action: "Help me brainstorm" },
];

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function SuggestionPill({ action, onClick }: { action: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-full border border-neutral-700 bg-neutral-900/50 text-neutral-300 text-sm hover:border-[#40bfae]/50 hover:text-[#40bfae] hover:bg-neutral-800/50 transition-all duration-300 backdrop-blur-sm flex items-center gap-2"
    >
      <span>{action}</span>
      <ArrowRight className="w-3 h-3" />
    </button>
  );
}

export default function PromptPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [activeToolCall, setActiveToolCall] = useState<ToolCall | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResultOption[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const workspaces = useAppStore((s) => s.workspaces);
  const channels = useAppStore((s) => s.channels);
  const currentWorkspaceId = useAppStore((s) => s.currentWorkspaceId);
  const currentChannelId = useAppStore((s) => s.currentChannelId);
  const user = useAppStore((s) => s.user);
  const updateUserName = useAppStore((s) => s.updateUserName);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fuzzy match helper
  const fuzzyMatch = (text: string, query: string): boolean => {
    const lower = text.toLowerCase();
    const q = query.toLowerCase().trim();
    return lower.includes(q) || q.split(/\s+/).every(word => lower.includes(word));
  };

  // Navigate to workspace
  const handleNavigateWorkspace = useCallback((workspaceName: string): ToolCall => {
    const matches = workspaces.filter(w => fuzzyMatch(w.name, workspaceName));
    const id = `tool-${Date.now()}`;
    const toolCall: ToolCall = {
      id,
      tool: "navigate_workspace",
      status: matches.length > 1 ? "pending" : "running",
      params: { workspace_name: workspaceName },
    };

    if (matches.length === 0) {
      toolCall.status = "error";
      toolCall.result = `No workspace found matching "${workspaceName}"`;
    } else if (matches.length === 1) {
      navigate(`/app/${matches[0].id}/${currentChannelId || ''}`);
      toolCall.status = "completed";
      toolCall.result = `Navigated to ${matches[0].name}`;
    } else {
      // Multiple matches - show as clickable options
      toolCall.options = matches.map(w => ({
        id: w.id,
        label: w.name,
        description: `Workspace • ${w.icon || '◎'}`,
        icon: "workspace" as const,
        action: () => {
          navigate(`/app/${w.id}/${currentChannelId || ''}`);
          setActiveToolCall(prev => prev?.id === id ? { ...prev, status: "completed", result: `Navigated to ${w.name}` } : prev);
        },
      }));
    }

    setActiveToolCall(toolCall);
    return toolCall;
  }, [workspaces, currentChannelId, navigate]);

  // Navigate to channel
  const handleNavigateChannel = useCallback((channelName: string, workspaceName?: string): ToolCall => {
    const id = `tool-${Date.now()}`;
    let targetChannels = channels;

    // Filter by workspace if specified
    if (workspaceName) {
      const wsMatches = workspaces.filter(w => fuzzyMatch(w.name, workspaceName));
      if (wsMatches.length === 1) {
        targetChannels = channels.filter(c => c.workspaceId === wsMatches[0].id);
      }
    }

    const matches = targetChannels.filter(c => fuzzyMatch(c.name, channelName));
    const toolCall: ToolCall = {
      id,
      tool: "navigate_channel",
      status: matches.length > 1 ? "pending" : "running",
      params: { channel_name: channelName, workspace_name: workspaceName || "" },
    };

    if (matches.length === 0) {
      toolCall.status = "error";
      toolCall.result = `No channel found matching "${channelName}"`;
    } else if (matches.length === 1) {
      navigate(`/app/${matches[0].workspaceId}/${matches[0].id}`);
      toolCall.status = "completed";
      toolCall.result = `Navigated to #${matches[0].name}`;
    } else {
      toolCall.options = matches.map(c => {
        const ws = workspaces.find(w => w.id === c.workspaceId);
        return {
          id: c.id,
          label: `#${c.name}`,
          description: `in ${ws?.name || 'Unknown workspace'}`,
          icon: "channel" as const,
          action: () => {
            navigate(`/app/${c.workspaceId}/${c.id}`);
            setActiveToolCall(prev => prev?.id === id ? { ...prev, status: "completed", result: `Navigated to #${c.name}` } : prev);
          },
        };
      });
    }

    setActiveToolCall(toolCall);
    return toolCall;
  }, [channels, workspaces, navigate]);

  // Navigate to DM
  const handleNavigateDM = useCallback(async (userName: string, workspaceName?: string): Promise<ToolCall> => {
    const id = `tool-${Date.now()}`;
    const toolCall: ToolCall = {
      id,
      tool: "navigate_dm",
      status: "running",
      params: { user_name: userName, workspace_name: workspaceName || "" },
    };

    try {
      // Find workspace to use
      let targetWorkspaceId = currentWorkspaceId;
      if (workspaceName) {
        const wsMatches = workspaces.filter(w => fuzzyMatch(w.name, workspaceName));
        if (wsMatches.length === 1) {
          targetWorkspaceId = wsMatches[0].id;
        }
      }

      if (!targetWorkspaceId) {
        toolCall.status = "error";
        toolCall.result = "No workspace specified or found";
        setActiveToolCall(toolCall);
        return toolCall;
      }

      // Fetch workspace members to find user
      const { fetchWorkspaceMemberProfiles } = await import("@/lib/supabase-data");
      const members = await fetchWorkspaceMemberProfiles(targetWorkspaceId);
      const matches = members.filter(m =>
        (m.displayName && fuzzyMatch(m.displayName, userName)) ||
        (m.email && fuzzyMatch(m.email, userName))
      );

      if (matches.length === 0) {
        toolCall.status = "error";
        toolCall.result = `No user found matching "${userName}"`;
      } else if (matches.length === 1) {
        // Find or create DM channel
        const { findExistingDm, createDmChannel } = await import("@/lib/supabase-data");
        let dmChannel = await findExistingDm(targetWorkspaceId, matches[0].userId);
        if (!dmChannel) {
          dmChannel = await createDmChannel(targetWorkspaceId, matches[0].userId);
        }
        navigate(`/app/${targetWorkspaceId}/${dmChannel.id}`);
        toolCall.status = "completed";
        toolCall.result = `Opened DM with ${matches[0].displayName || matches[0].email}`;
      } else {
        toolCall.options = matches.map(m => ({
          id: m.userId,
          label: m.displayName || m.email,
          description: m.email,
          icon: "user" as const,
          action: async () => {
            const { findExistingDm, createDmChannel } = await import("@/lib/supabase-data");
            let dmChannel = await findExistingDm(targetWorkspaceId!, m.userId);
            if (!dmChannel) {
              dmChannel = await createDmChannel(targetWorkspaceId!, m.userId);
            }
            navigate(`/app/${targetWorkspaceId}/${dmChannel.id}`);
            setActiveToolCall(prev => prev?.id === id ? { ...prev, status: "completed", result: `Opened DM with ${m.displayName || m.email}` } : prev);
          },
        }));
        toolCall.status = "pending";
      }
    } catch (err) {
      toolCall.status = "error";
      toolCall.result = err instanceof Error ? err.message : "Failed to find DM";
    }

    setActiveToolCall(toolCall);
    return toolCall;
  }, [currentWorkspaceId, workspaces, navigate]);

  // Search content
  const handleSearchContent = useCallback(async (query: string, searchType?: string): Promise<ToolCall> => {
    const id = `tool-${Date.now()}`;
    const toolCall: ToolCall = {
      id,
      tool: "search_content",
      status: "running",
      params: { query, search_type: searchType || "all" },
    };

    try {
      const results: SearchResultOption[] = [];

      // Search workspaces
      if (!searchType || searchType === "all" || searchType === "workspaces") {
        const wsMatches = workspaces.filter(w => fuzzyMatch(w.name, query));
        results.push(...wsMatches.map(w => ({
          id: w.id,
          label: w.name,
          description: `Workspace • ${w.icon || '◎'}`,
          icon: "workspace" as const,
          action: () => {
            navigate(`/app/${w.id}/${currentChannelId || ''}`);
            setActiveToolCall(prev => prev?.id === id ? { ...prev, status: "completed" } : prev);
          },
        })));
      }

      // Search channels
      if (!searchType || searchType === "all" || searchType === "channels") {
        const chMatches = channels.filter(c => fuzzyMatch(c.name, query));
        results.push(...chMatches.map(c => {
          const ws = workspaces.find(w => w.id === c.workspaceId);
          return {
            id: c.id,
            label: `#${c.name}`,
            description: `in ${ws?.name || 'Unknown'}`,
            icon: "channel" as const,
            action: () => {
              navigate(`/app/${c.workspaceId}/${c.id}`);
              setActiveToolCall(prev => prev?.id === id ? { ...prev, status: "completed" } : prev);
            },
          };
        }));
      }

      // Search files (if API available)
      if (!searchType || searchType === "all" || searchType === "files") {
        if (currentWorkspaceId) {
          const { searchFilesAi } = await import("@/lib/supabase-data");
          try {
            const { files } = await searchFilesAi(currentWorkspaceId, query);
            results.push(...files.slice(0, 5).map(f => ({
              id: f.id,
              label: f.fileName,
              description: f.summary || `${(f.fileSize / 1024).toFixed(1)} KB`,
              icon: "file" as const,
              action: () => {
                setActiveToolCall(prev => prev?.id === id ? { ...prev, status: "completed" } : prev);
              },
            })));
          } catch {
            // Files search not critical, ignore errors
          }
        }
      }

      if (results.length === 0) {
        toolCall.status = "completed";
        toolCall.result = `No results found for "${query}"`;
      } else {
        toolCall.options = results;
        toolCall.status = "pending";
        toolCall.result = `Found ${results.length} result${results.length > 1 ? 's' : ''}`;
      }
    } catch (err) {
      toolCall.status = "error";
      toolCall.result = err instanceof Error ? err.message : "Search failed";
    }

    setActiveToolCall(toolCall);
    return toolCall;
  }, [workspaces, channels, currentWorkspaceId, currentChannelId, navigate]);

  // Parse and execute tool calls from user message
  const parseAndExecuteTool = useCallback(async (message: string): Promise<ToolCall | null> => {
    const lower = message.toLowerCase();

    // Navigate workspace patterns
    const workspacePatterns = [
      /(?:go to|take me to|navigate to|open|show me)\s+(?:the\s+)?([a-z0-9\s]+)\s+workspace/i,
      /(?:switch to|go to)\s+([a-z0-9\s]+)\s+workspace/i,
      /^workspace\s+"?([a-z0-9\s]+)"?$/i,
    ];

    for (const pattern of workspacePatterns) {
      const match = lower.match(pattern);
      if (match && match[1]) {
        return handleNavigateWorkspace(match[1].trim());
      }
    }

    // Navigate channel patterns
    const channelPatterns = [
      /(?:go to|open|navigate to|switch to)\s+(?:the\s+)?(?:channel\s+)?(?:called\s+)?(?:named\s+)?["']?([a-z0-9\s]+)["']?$/i,
      /(?:open|show me)\s+(?:the\s+)?([a-z0-9\s]+)\s+channel/i,
      /^channel\s+"?([a-z0-9\s]+)"?$/i,
    ];

    for (const pattern of channelPatterns) {
      const match = lower.match(pattern);
      if (match && match[1]) {
        return handleNavigateChannel(match[1].trim());
      }
    }

    // DM / message patterns
    const dmPatterns = [
      /(?:message|dm|chat with|talk to|contact)\s+([a-z0-9\s]+)/i,
      /(?:open|start)\s+(?:a\s+)?(?:dm|chat)\s+with\s+([a-z0-9\s]+)/i,
    ];

    for (const pattern of dmPatterns) {
      const match = lower.match(pattern);
      if (match && match[1]) {
        return handleNavigateDM(match[1].trim());
      }
    }

    // Search patterns
    const searchPatterns = [
      /(?:search|find|look for|lookup)\s+(?:for\s+)?(?:a\s+)?(?:file|document|message|channel|workspace)?\s*(?:called\s+)?(?:named\s+)?["']?([a-z0-9\s]+)["']?$/i,
      /(?:search|find)\s+["']?([a-z0-9\s]+)["']?$/i,
    ];

    for (const pattern of searchPatterns) {
      const match = lower.match(pattern);
      if (match && match[1]) {
        return handleSearchContent(match[1].trim());
      }
    }

    return null;
  }, [handleNavigateWorkspace, handleNavigateChannel, handleNavigateDM, handleSearchContent]);

  const handleSearch = (query: string) => {
    // Navigate to current workspace with search context
    if (currentWorkspaceId && currentChannelId) {
      navigate(`/app/${currentWorkspaceId}/${currentChannelId}?search=${encodeURIComponent(query)}`);
    }
  };

  const handleSend = async (message: string, files?: File[]) => {
    if (!message.trim()) return;

    setShowWelcome(false);
    setIsLoading(true);
    setActiveToolCall(null);
    setSearchResults([]);

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Try to parse and execute tool call first
    const toolCall = await parseAndExecuteTool(message);
    if (toolCall) {
      // Show tool call in chat
      const toolMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: `Running ${toolCall.tool}...`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, toolMsg]);
      setIsLoading(false);
      return;
    }

    // Stream from LLM
    const threadId = currentChannelId || "default";
    let fullResponse = "";

    try {
      await streamAssistant(
        threadId,
        message,
        {
          onToken: (token) => {
            fullResponse += token;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && last.isStreaming) {
                return [...prev.slice(0, -1), { ...last, content: fullResponse }];
              }
              return [
                ...prev,
                {
                  id: `assistant-${Date.now()}`,
                  role: "assistant" as const,
                  content: fullResponse,
                  timestamp: new Date(),
                  isStreaming: true,
                },
              ];
            });
          },
          onComplete: (msg: Message) => {
            fullResponse = msg.content;
          },
          onActionUpdate: () => {},
        },
        { tools: [] } // Pass empty tools array to indicate no tools - backend decides based on available tools
      );
    } catch (error) {
      fullResponse = error instanceof Error ? error.message : "I'm having trouble connecting right now. Please try again.";
    }

    // Replace streaming message with final
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? { ...m, content: fullResponse, isStreaming: false }
          : m
      )
    );
    setIsLoading(false);
  };

  const [settingsName, setSettingsName] = useState(user?.name || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Check if we're NOT in a workspace (on main PromptPage at /app, not /app/:workspaceId)
  const location = useLocation();
  const isInWorkspace = Boolean(location.pathname.match(/^\/app\/[^/]+$/)?.[0]);

  // Debounced auto-save for settings name
  useEffect(() => {
    const timer = setTimeout(() => {
      if (settingsName !== user?.name) {
        updateUserName(settingsName);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [settingsName, user?.name, updateUserName]);

  const handleSaveAndClose = useCallback(async () => {
    if (!settingsName.trim()) return;
    setIsSaving(true);
    setSaveSuccess(false);

    // Update local store
    updateUserName(settingsName);

    // Update Supabase user metadata
    if (supabase) {
      const { error } = await supabase.auth.updateUser({
        data: { name: settingsName },
      });
      if (error) {
        console.error("Failed to update user metadata:", error);
      }
    }

    setIsSaving(false);
    setSaveSuccess(true);
    setSettingsOpen(false);
    setTimeout(() => setSaveSuccess(false), 2000);
  }, [settingsName, updateUserName]);

  const handleClearConversation = () => {
    setMessages([]);
    setShowWelcome(true);
  };

  // SessionNavBar component
  const SessionNavBar = () => (
    <div
      className={cn(
        "fixed left-0 top-0 h-full z-40 flex flex-col bg-black/80 backdrop-blur-xl border-r border-neutral-800 transition-all duration-300 ease-in-out",
        "hover:w-64 w-16 group",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
      onMouseEnter={() => setSidebarCollapsed(false)}
      onMouseLeave={() => setSidebarCollapsed(true)}
    >
      {/* Logo/Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-neutral-800">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#40bfae] to-[#2d9a8a] flex items-center justify-center shrink-0">
          <span className="text-black font-bold text-sm">L</span>
        </div>
        <span className={cn("text-neutral-100 font-semibold text-lg whitespace-nowrap transition-opacity duration-200", sidebarCollapsed ? "opacity-0" : "opacity-100")}>
          Loop AI
        </span>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        {/* Back to AI Chat */}
        <Link
          to="/app"
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-neutral-400 hover:text-[#40bfae] hover:bg-neutral-800/50 transition-all duration-200",
            sidebarCollapsed ? "justify-center" : ""
          )}
        >
          <MessageCircle className="w-5 h-5 shrink-0" />
          <span className={cn("whitespace-nowrap transition-opacity duration-200", sidebarCollapsed ? "opacity-0 w-0" : "opacity-100")}>
            Back to AI Chat
          </span>
        </Link>

        {/* Workspaces Section */}
        <div className="mt-6 px-4">
          <div className={cn("flex items-center gap-2 mb-2 transition-opacity duration-200", sidebarCollapsed ? "opacity-0" : "opacity-100")}>
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Workspaces</span>
          </div>
          <div className="space-y-1">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.id}
                to={`/app/${workspace.id}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-400 hover:text-[#40bfae] hover:bg-neutral-800/50 transition-all duration-200",
                  sidebarCollapsed ? "justify-center" : ""
                )}
              >
                <span className="w-5 h-5 rounded-md bg-[#40bfae]/20 flex items-center justify-center shrink-0 text-[#40bfae] text-xs font-medium">
                  {workspace.icon || workspace.name.charAt(0).toUpperCase()}
                </span>
                <span className={cn("whitespace-nowrap transition-opacity duration-200 truncate", sidebarCollapsed ? "opacity-0 w-0" : "opacity-100")}>
                  {workspace.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-neutral-800 p-4">
        <div className={cn("flex items-center gap-3 transition-opacity duration-200", sidebarCollapsed ? "opacity-0" : "opacity-100")}>
          <div className="w-8 h-8 rounded-full bg-[#40bfae]/20 flex items-center justify-center">
            <span className="text-[#40bfae] text-sm font-medium">{user?.name?.charAt(0).toUpperCase() || 'U'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-neutral-200 truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-neutral-500 truncate">{user?.email || ''}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen w-full bg-black overflow-hidden">
      <AnimatedGradientBackground />

      {/* Session Sidebar - only show when NOT in a workspace */}
      {!isInWorkspace && <SessionNavBar />}

      <div className="relative z-10 flex flex-col min-h-screen transition-all duration-300">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex items-center justify-between px-6 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#40bfae] to-[#2d9a8a] flex items-center justify-center">
              <span className="text-black font-bold text-sm">L</span>
            </div>
            <span className="text-neutral-100 font-semibold text-lg">Loop AI</span>
          </div>

          <div className="flex items-center gap-4">
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <button className="h-9 px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700 hover:border-neutral-600 transition-all duration-300 text-sm font-medium flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px] bg-black border border-neutral-700">
                <DialogHeader>
                  <DialogTitle className="text-neutral-100">Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium text-neutral-200">
                      Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#40bfae] focus:border-transparent transition-all"
                      placeholder="Enter your name"
                    />
                  </div>
                  <button
                    onClick={handleSaveAndClose}
                    disabled={isSaving}
                    className="w-full px-4 py-2 rounded-lg bg-[#40bfae] text-black hover:bg-[#3daf9e] transition-all duration-300 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : saveSuccess ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Saved!</span>
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </motion.header>

        {/* Main content */}
        <div className={`flex-1 flex flex-col items-center px-4 md:px-6 lg:px-8 pb-8 md:pb-12 ${messages.length === 0 ? 'justify-center' : 'justify-end'}`}>
          <div className="w-full max-w-2xl mx-auto flex flex-col min-h-0" style={{ maxHeight: messages.length === 0 ? "none" : "calc(100vh - 180px)" }}>
            {/* Welcome state */}
            <AnimatePresence>
              {showWelcome && messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.6 }}
                  className="text-center mb-8 mt-auto pt-8"
                >
                  <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#40bfae] to-[#7dd3c0] mb-4">
                    What would you like to do?
                  </h1>
                  <p className="text-neutral-400 text-lg mb-8">
                    Ask questions, search the web, brainstorm ideas, or navigate to any workspace.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {quickActions.map((action, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 * index }}
                      >
                        <SuggestionPill
                          action={action.label}
                          onClick={() => handleSend(action.action)}
                        />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat messages */}
            {messages.length > 0 && (
              <div className="space-y-6 mb-6 overflow-y-auto flex-1 min-h-0" style={{ maxHeight: "calc(100vh - 320px)" }}>
                {messages.map((msg, index) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-[#40bfae]/20 border border-[#40bfae]/30 text-neutral-100"
                          : "bg-neutral-900/80 border border-neutral-700/50 text-neutral-200"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-2 mb-2 text-[#40bfae] text-xs font-medium">
                          <div className="w-4 h-4 rounded-full bg-[#40bfae]/20 flex items-center justify-center">
                            <span className="text-[10px]">AI</span>
                          </div>
                          <span>Loop AI</span>
                        </div>
                      )}
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                        {msg.isStreaming && (
                          <span className="inline-block ml-1 w-2 h-4 bg-[#40bfae] animate-pulse" />
                        )}
                      </div>
                      <div className={`text-xs mt-1 ${msg.role === "user" ? "text-neutral-400" : "text-neutral-500"}`}>
                        {formatTimestamp(msg.timestamp)}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {isLoading && messages[messages.length - 1]?.role === "user" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 text-neutral-400 text-sm"
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-[#40bfae]" />
                    <span>Thinking...</span>
                  </motion.div>
                )}

                {/* Tool call UI */}
                {activeToolCall && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-neutral-900/80 border border-neutral-700/50 rounded-2xl px-4 py-3"
                  >
                    <div className="flex items-center gap-2 mb-2 text-[#40bfae] text-xs font-medium">
                      <div className="w-4 h-4 rounded-full bg-[#40bfae]/20 flex items-center justify-center">
                        <span className="text-[10px]">⬡</span>
                      </div>
                      <span>Tool: {activeToolCall.tool}</span>
                      {activeToolCall.status === "running" && (
                        <Loader2 className="w-3 h-3 animate-spin ml-1" />
                      )}
                      {activeToolCall.status === "completed" && (
                        <Check className="w-3 h-3 ml-1 text-green-400" />
                      )}
                      {activeToolCall.status === "error" && (
                        <X className="w-3 h-3 ml-1 text-red-400" />
                      )}
                    </div>
                    <div className="text-xs text-neutral-400 mb-2">
                      {Object.entries(activeToolCall.params).map(([k, v]) => (
                        <span key={k} className="mr-3">{k}: <span className="text-neutral-200">{v}</span></span>
                      ))}
                    </div>
                    {activeToolCall.result && (
                      <div className="text-sm text-neutral-300 mb-2">{activeToolCall.result}</div>
                    )}
                    {activeToolCall.options && activeToolCall.options.length > 0 && (
                      <div className="space-y-2 mt-3">
                        <div className="text-xs text-neutral-400">Select an option:</div>
                        {activeToolCall.options.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={opt.action}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-left transition-colors"
                          >
                            {opt.icon === "workspace" && <FolderOpen className="w-4 h-4 text-[#40bfae]" />}
                            {opt.icon === "channel" && <MessageSquare className="w-4 h-4 text-[#40bfae]" />}
                            {opt.icon === "file" && <Search className="w-4 h-4 text-[#40bfae]" />}
                            {opt.icon === "user" && <User className="w-4 h-4 text-[#40bfae]" />}
                            <div>
                              <div className="text-sm text-neutral-200 font-medium">{opt.label}</div>
                              <div className="text-xs text-neutral-500">{opt.description}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}

            {/* Input area */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: showWelcome ? 0.6 : 0 }}
              className="mt-auto pt-4"
            >
              <div className="relative">
                <PromptInputBox
                  onSend={handleSend}
                  isLoading={isLoading}
                  placeholder="Ask anything, or say 'show my workspaces'..."
                  className="w-full"
                />
              </div>
              {messages.length > 0 && (
                <div className="flex justify-center mt-2">
                  <button
                    onClick={handleClearConversation}
                    className="flex items-center gap-1 px-3 py-1 text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>Clear conversation</span>
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </div>

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
