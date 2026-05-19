"use client";

import React from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface ChatPreviewMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  senderName?: string;
  senderAvatar?: string;
  timestamp?: Date;
}

export interface ChatPreviewProps {
  messages?: ChatPreviewMessage[];
  workspaceName?: string;
  channelName?: string;
  className?: string;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function truncateMessage(content: string, maxLength: number = 80): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trim() + "...";
}

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export const ChatPreview: React.FC<ChatPreviewProps> = ({
  messages = [],
  workspaceName,
  channelName,
  className = "",
}) => {
  const hasContext = workspaceName || channelName;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg overflow-hidden border border-neutral-800",
        className
      )}
      style={{ backgroundColor: "#0A0A0A", maxWidth: "320px" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800"
        style={{ backgroundColor: "#111111" }}
      >
        {hasContext && (
          <span className="text-xs text-neutral-500">
            {channelName && <span className="text-[#40bfae]"># {channelName}</span>}
            {workspaceName && <span> in {workspaceName}</span>}
          </span>
        )}
        {!hasContext && (
          <>
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "#40bfae" }}
            />
            <span className="text-xs font-medium text-neutral-400">Loop AI</span>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-xs text-neutral-500 text-center py-4">
            No messages
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className="flex items-start gap-2"
            >
              {/* Avatar */}
              <Avatar className="h-7 w-7 shrink-0">
                {message.senderAvatar ? (
                  <AvatarImage src={message.senderAvatar} />
                ) : (
                  <AvatarFallback
                    className={cn(
                      "text-xs",
                      message.role === "user"
                        ? "bg-[#40bfae]/20 text-[#40bfae]"
                        : "bg-neutral-800 text-neutral-400"
                    )}
                  >
                    {getInitials(message.senderName)}
                  </AvatarFallback>
                )}
              </Avatar>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      message.role === "user"
                        ? "text-[#40bfae]"
                        : "text-neutral-400"
                    )}
                  >
                    {message.senderName || (message.role === "user" ? "You" : "Loop AI")}
                  </span>
                  {message.timestamp && (
                    <span className="text-[10px] text-neutral-600">
                      {formatTime(message.timestamp)}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "text-sm leading-relaxed break-words",
                    message.role === "user"
                      ? "text-neutral-200"
                      : "text-neutral-300"
                  )}
                >
                  {truncateMessage(message.content)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ChatPreview;