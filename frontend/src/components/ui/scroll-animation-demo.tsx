"use client";
import React from "react";
import { Bot, User, Paperclip, Send, Menu, Search, PanelRightOpen } from "lucide-react";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";

/**
 * Loop AI Chat Interface Preview
 * A demo component showcasing the Loop AI chat interface for the landing page
 */
export function LoopAIPreview() {
  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Chat Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-card">
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-md hover:bg-muted transition-colors lg:hidden">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Engineering</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">general</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Search..."
              className="w-48 pl-8 pr-8 h-8 text-sm bg-muted/50 border border-transparent focus:border-border rounded-md"
              readOnly
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">⌘K</kbd>
          </div>
          <button className="p-2 rounded-md hover:bg-muted transition-colors hidden md:flex">
            <PanelRightOpen className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* User Message */}
        <div className="flex gap-3 justify-end">
          <div className="flex flex-col items-end max-w-[80%]">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">You</span>
              <span className="text-xs text-muted-foreground">2:34 PM</span>
            </div>
            <div className="bg-primary text-primary-foreground rounded-xl px-3 py-2 border border-primary/30">
              <p className="text-sm">Can you help me understand the authentication flow in the codebase?</p>
            </div>
          </div>
        </div>

        {/* AI Assistant Message */}
        <div className="flex gap-3 justify-start">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col items-start max-w-[80%]">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">Loop AI</span>
              <span className="text-xs text-muted-foreground">2:34 PM</span>
            </div>
            <div className="bg-muted border border-border rounded-xl px-3 py-2">
              <div className="space-y-2">
                <p className="text-sm">The authentication flow uses OAuth 2.0 with Supabase. Here's a summary:</p>
                <div className="bg-surface-sunken border border-border rounded-md p-2 mt-2">
                  <p className="text-xs font-mono text-muted-foreground">1. User → /login → Supabase auth</p>
                  <p className="text-xs font-mono text-muted-foreground">2. Callback → JWT stored</p>
                  <p className="text-xs font-mono text-muted-foreground">3. Protected routes check session</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* File Message */}
        <div className="flex gap-3 justify-end">
          <div className="flex flex-col items-end max-w-[80%]">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">You</span>
              <span className="text-xs text-muted-foreground">2:36 PM</span>
            </div>
            <div className="bg-muted border border-border rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                <div>
                  <p className="text-sm font-medium">auth-flow.pdf</p>
                  <p className="text-xs text-muted-foreground">2.4 MB</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex items-end gap-2">
          <button className="p-2 rounded-md hover:bg-muted transition-colors">
            <Paperclip className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1 bg-muted/50 border border-border rounded-xl px-3 py-2 flex items-end gap-2">
            <textarea
              className="flex-1 bg-transparent border-none outline-none resize-none text-sm min-h-[24px] max-h-32"
              placeholder="Type a message..."
              rows={1}
            />
            <button className="p-1.5 rounded-md hover:bg-muted transition-colors">
              <Send className="w-4 h-4 text-primary" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Demo page showcasing the ContainerScroll with Loop AI UI
 */
export function ScrollAnimationDemo() {
  return (
    <div className="min-h-screen bg-background">
      <ContainerScroll
        titleComponent={
          <div className="text-4xl md:text-6xl font-bold tracking-tight">
            <h1 className="text-foreground">Experience the future of</h1>
            <h2 className="text-primary">team collaboration</h2>
          </div>
        }
      >
        <LoopAIPreview />
      </ContainerScroll>
    </div>
  );
}

export default ScrollAnimationDemo;