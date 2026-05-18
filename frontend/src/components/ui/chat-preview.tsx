import React from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

interface ChatPreviewProps {
  messages?: Message[];
  className?: string;
}

const defaultMessages: Message[] = [
  { id: "1", role: "assistant", content: "Hello! How can I help you today?" },
  { id: "2", role: "user", content: "I need help with my account settings." },
  {
    id: "3",
    role: "assistant",
    content: "Sure, I can assist with that. What would you like to change?",
  },
];

export const ChatPreview: React.FC<ChatPreviewProps> = ({
  messages = defaultMessages,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden ${className}`}
      style={{ maxWidth: "320px" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border"
        style={{ backgroundColor: "hsl(var(--surface-sunken))" }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: "#40bfae" }}
        />
        <span className="text-xs font-medium text-secondary">Loop AI</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            style={{
              animation: "message-appear 0.3s ease-out forwards",
              animationDelay: `${index * 0.1}s`,
              opacity: 0,
            }}
          >
            <div
              className={`max-w-[80%] px-3 py-2 text-sm rounded-lg ${
                message.role === "user"
                  ? "text-white rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              }`}
              style={
                message.role === "user"
                  ? { backgroundColor: "#40bfae" }
                  : undefined
              }
            >
              {message.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input hint */}
      <div
        className="px-3 py-2 border-t border-border"
        style={{ backgroundColor: "hsl(var(--surface-sunken))" }}
      >
        <div
          className="text-xs text-muted-foreground px-3 py-2 rounded-md border border-border"
          style={{ backgroundColor: "hsl(var(--muted))" }}
        >
          Type a message...
        </div>
      </div>
    </div>
  );
};

export default ChatPreview;
