"use client";

import { Link } from "react-router-dom";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { Button } from "@/components/ui/button";

function ChatUIDemo() {
  return (
    <div className="w-full h-full bg-neutral-900 rounded-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-neutral-400 text-sm font-medium">general</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border border-neutral-700 flex items-center justify-center">
            <span className="text-neutral-500 text-xs">?</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        {/* AI Message */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-medium">Loop AI</span>
              <span className="text-neutral-500 text-xs">just now</span>
            </div>
            <div className="bg-neutral-800 rounded-2xl rounded-tl-md p-3 max-w-md">
              <p className="text-neutral-100 text-sm">
                Hi! I am your AI assistant. How can I help you today?
              </p>
            </div>
          </div>
        </div>

        {/* User Message */}
        <div className="flex gap-3 justify-end">
          <div className="flex-1 space-y-2 items-end flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 text-xs">just now</span>
              <span className="text-white text-sm font-medium">You</span>
            </div>
            <div className="bg-blue-600 rounded-2xl rounded-tr-md p-3 max-w-md">
              <p className="text-white text-sm">
                Can you help me understand the project architecture?
              </p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex-shrink-0" />
        </div>

        {/* AI Response */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-medium">Loop AI</span>
              <span className="text-neutral-500 text-xs">just now</span>
            </div>
            <div className="bg-neutral-800 rounded-2xl rounded-tl-md p-3 max-w-md">
              <p className="text-neutral-100 text-sm">
                The project follows a monorepo structure with separate frontend and
                backend packages. The frontend is built with React and TypeScript,
                while the backend handles API requests and data processing.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-neutral-800">
        <div className="bg-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-neutral-500 text-sm">Message Loop AI...</span>
          <div className="flex-1" />
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <BackgroundPaths title="Team AI Assistant" />

      {/* Scroll Animation Section */}
      <ContainerScroll
        titleComponent={
          <h2 className="text-4xl md:text-6xl font-bold text-center mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-white dark:to-neutral-400">
              See Loop AI in Action
            </span>
          </h2>
        }
      >
        <ChatUIDemo />
      </ContainerScroll>

      {/* Sign in link */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-foreground underline underline-offset-2 hover:opacity-80"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}