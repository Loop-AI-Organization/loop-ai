"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import AnimatedGradientBackground from "@/components/ui/animated-gradient-background";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";
import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { streamAssistant, sendMessage } from "@/lib/api-client";
import { Search, User, FolderOpen, MessageSquare, ArrowRight, Loader2, X } from "lucide-react";
import type { Message } from "@/types";
import type { Workspace } from "@/components/ui/workspaces";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
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

function parseNavigationIntent(content: string): { action: "navigate" | "search" | "chat"; target?: string; query?: string } | null {
  const lower = content.toLowerCase();

  // Workspace navigation patterns
  const workspaceMatch = lower.match(/(?:show|open|go to|navigate to|switch to)\s+(?:my\s+)?(?:workspaces?|(?:workspace\s+(?:called|named)?\s+"?)([a-z0-9\s]+)?)/i);
  if (workspaceMatch && workspaceMatch[1]) {
    return { action: "navigate", target: workspaceMatch[1].trim() };
  }

  // Channel navigation patterns
  const channelMatch = lower.match(/(?:go to|open|navigate to|switch to)\s+(?:channel\s+)?(?:called|named)?\s*"?([a-z0-9\s]+)/i);
  if (channelMatch && channelMatch[1]) {
    return { action: "navigate", target: channelMatch[1].trim() };
  }

  // Search patterns
  const searchMatch = lower.match(/(?:search|find|look for)\s+(?:for\s+)?(?:a\s+)?(?:file|document|message|channel)?\s*(?:called|named)?\s*"?([a-z0-9\s]+)?/i);
  if (searchMatch) {
    return { action: "search", query: searchMatch[1] || "" };
  }

  // Default chat
  return null;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const workspaces = useAppStore((s) => s.workspaces);
  const channels = useAppStore((s) => s.channels);
  const currentWorkspaceId = useAppStore((s) => s.currentWorkspaceId);
  const currentChannelId = useAppStore((s) => s.currentChannelId);

  // Extended workspace type with logo
  type WorkspaceWithLogo = Workspace & { logo?: string };

  // Map stores workspaces to the format expected by the component
  const workspaceList: WorkspaceWithLogo[] = workspaces.map((w) => ({
    ...w,
    logo: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(w.name)}&backgroundColor=40bfae&textColor=ffffff`,
  }));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleNavigate = (target: string) => {
    // Try to find matching workspace
    const workspace = workspaces.find(
      (w) => w.name.toLowerCase().includes(target.toLowerCase())
    );

    if (workspace) {
      const workspaceChannels = channels.filter((c) => c.workspaceId === workspace.id);
      if (workspaceChannels.length > 0) {
        navigate(`/app/${workspace.id}/${workspaceChannels[0].id}`);
        return;
      }
      navigate(`/app/${workspace.id}/${currentChannelId || ""}`);
      return;
    }

    // Try to find matching channel
    const channel = channels.find(
      (c) => c.name.toLowerCase().includes(target.toLowerCase())
    );

    if (channel) {
      navigate(`/app/${channel.workspaceId}/${channel.id}`);
      return;
    }

    // Default to current workspace
    if (currentWorkspaceId && currentChannelId) {
      navigate(`/app/${currentWorkspaceId}/${currentChannelId}`);
    }
  };

  const handleSearch = (query: string) => {
    // Navigate to current workspace with search context
    if (currentWorkspaceId && currentChannelId) {
      navigate(`/app/${currentWorkspaceId}/${currentChannelId}?search=${encodeURIComponent(query)}`);
    }
  };

  const handleAssistantResponse = (userMessage: string) => {
    const intent = parseNavigationIntent(userMessage);

    if (intent?.action === "navigate" && intent.target) {
      handleNavigate(intent.target);
      return { response: `Navigating to ${intent.target}...`, done: true };
    }

    if (intent?.action === "search" && intent.query) {
      handleSearch(intent.query);
      return { response: `Searching for "${intent.query}"...`, done: true };
    }

    return null;
  };

  const handleSend = async (message: string, files?: File[]) => {
    if (!message.trim()) return;

    setShowWelcome(false);
    setIsLoading(true);

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Check for navigation/search intent
    const intentResponse = handleAssistantResponse(message);
    if (intentResponse) {
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: intentResponse.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
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
        }
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

  const clearChat = () => {
    setMessages([]);
    setShowWelcome(true);
  };

  const handleWorkspaceSelect = (workspace: Workspace) => {
    const ws = workspace as WorkspaceWithLogo;
    const workspaceChannels = channels.filter((c) => c.workspaceId === ws.id);
    if (workspaceChannels.length > 0) {
      navigate(`/app/${ws.id}/${workspaceChannels[0].id}`);
    } else {
      navigate(`/app/${ws.id}`);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-black overflow-hidden">
      <AnimatedGradientBackground />

      <div className="relative z-10 flex flex-col min-h-screen">
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
            {/* Workspace Switcher */}
            {workspaceList.length > 0 ? (
              <AnimatedDropdown
                workspaces={workspaceList}
                selectedWorkspaceId={currentWorkspaceId || workspaceList[0]?.id}
                onWorkspaceChange={handleWorkspaceSelect}
              />
            ) : (
              <button
                onClick={() => navigate("/app")}
                className="text-neutral-400 hover:text-neutral-100 text-sm transition-colors"
              >
                Dashboard
              </button>
            )}

            <Dialog>
              <DialogTrigger asChild>
                <button
                  className="h-9 px-4 py-2 min-w-48 rounded-lg shadow-sm shadow-black/5 bg-gradient-to-r from-[#40bfae]/15 via-[#40bfae]/10 to-[#7dd3c0]/15 border border-[#40bfae]/20 text-[#40bfae] hover:from-[#40bfae]/25 hover:via-[#40bfae]/20 hover:to-[#7dd3c0]/25 transition-all duration-300 text-sm flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Settings</DialogTitle>
                  <DialogDescription>
                    Manage your account settings and preferences.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <button
                    onClick={() => navigate("/app/account")}
                    className="w-full text-left px-4 py-3 rounded-lg hover:bg-neutral-800/50 transition-colors flex items-center gap-3 text-neutral-200"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#40bfae]/20 flex items-center justify-center">
                      <User className="h-4 w-4 text-[#40bfae]" />
                    </div>
                    <div>
                      <div className="font-medium">Account</div>
                      <div className="text-xs text-neutral-500">Manage your account settings</div>
                    </div>
                  </button>
                  <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-neutral-800/50 transition-colors flex items-center gap-3 text-neutral-200">
                    <div className="w-8 h-8 rounded-full bg-[#40bfae]/20 flex items-center justify-center">
                      <CheckIcon className="h-4 w-4 text-[#40bfae]" />
                    </div>
                    <div>
                      <div className="font-medium">Notifications</div>
                      <div className="text-xs text-neutral-500">Configure notification preferences</div>
                    </div>
                  </button>
                  <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-neutral-800/50 transition-colors flex items-center gap-3 text-neutral-200">
                    <div className="w-8 h-8 rounded-full bg-[#40bfae]/20 flex items-center justify-center">
                      <span className="text-[#40bfae] text-sm font-bold">T</span>
                    </div>
                    <div>
                      <div className="font-medium">Theme</div>
                      <div className="text-xs text-neutral-500">Switch between light and dark mode</div>
                    </div>
                  </button>
                  <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-neutral-800/50 transition-colors flex items-center gap-3 text-neutral-200">
                    <div className="w-8 h-8 rounded-full bg-[#40bfae]/20 flex items-center justify-center">
                      <span className="text-[#40bfae] text-sm font-bold">S</span>
                    </div>
                    <div>
                      <div className="font-medium">Security</div>
                      <div className="text-xs text-neutral-500">Password and authentication</div>
                    </div>
                  </button>
                  <button className="w-full text-left px-4 py-3 rounded-lg hover:bg-neutral-800/50 transition-colors flex items-center gap-3 text-neutral-200">
                    <div className="w-8 h-8 rounded-full bg-[#40bfae]/20 flex items-center justify-center">
                      <span className="text-[#40bfae] text-sm font-bold">?</span>
                    </div>
                    <div>
                      <div className="font-medium">Help & Support</div>
                      <div className="text-xs text-neutral-500">Documentation and contact us</div>
                    </div>
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </motion.header>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-24">
          <div className="w-full max-w-3xl">
            {/* Welcome state */}
            <AnimatePresence>
              {showWelcome && messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.6 }}
                  className="text-center mb-12"
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
              <div className="space-y-6 mb-6 max-h-[50vh] overflow-y-auto">
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
              </div>
            )}

            {/* Input area */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: showWelcome ? 0.6 : 0 }}
              className="sticky bottom-0"
            >
              <div className="relative">
                <PromptInputBox
                  onSend={handleSend}
                  isLoading={isLoading}
                  placeholder="Ask anything, or say 'show my workspaces'..."
                  className="w-full"
                />
              </div>

              {/* Clear chat button */}
              {messages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-center mt-4"
                >
                  <button
                    onClick={clearChat}
                    className="text-neutral-500 hover:text-neutral-300 text-xs flex items-center gap-1 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Clear conversation
                  </button>
                </motion.div>
              )}
            </motion.div>
          </div>
        </div>

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}