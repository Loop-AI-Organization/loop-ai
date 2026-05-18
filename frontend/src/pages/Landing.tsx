"use client";

import { Link } from "react-router-dom";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { Button } from "@/components/ui/button";
import { LampContainer } from "@/components/ui/lamp";

function ChatUIDemo() {
  return (
    <div className="w-full h-full bg-black rounded-xl flex flex-col overflow-hidden border border-[#40bfae]/20">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#40bfae]" />
          <span className="text-neutral-300 text-sm font-medium">general</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border border-[#40bfae]/30 flex items-center justify-center">
            <span className="text-[#40bfae] text-xs">?</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        {/* AI Message */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-[#40bfae] flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[#40bfae] text-sm font-medium">Loop AI</span>
              <span className="text-neutral-500 text-xs">just now</span>
            </div>
            <div className="bg-neutral-900 rounded-2xl rounded-tl-md p-3 max-w-md border border-[#40bfae]/20">
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
              <span className="text-neutral-300 text-sm font-medium">You</span>
            </div>
            <div className="bg-[#40bfae] rounded-2xl rounded-tr-md p-3 max-w-md">
              <p className="text-black text-sm font-medium">
                Can you help me understand the project architecture?
              </p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-neutral-700 flex-shrink-0" />
        </div>

        {/* AI Response */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-[#40bfae] flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[#40bfae] text-sm font-medium">Loop AI</span>
              <span className="text-neutral-500 text-xs">just now</span>
            </div>
            <div className="bg-neutral-900 rounded-2xl rounded-tl-md p-3 max-w-md border border-[#40bfae]/20">
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
        <div className="bg-neutral-900 rounded-xl px-4 py-3 flex items-center gap-3 border border-[#40bfae]/20">
          <span className="text-neutral-500 text-sm">Message Loop AI...</span>
          <div className="flex-1" />
          <Button size="sm" className="bg-[#40bfae] hover:bg-[#3ab19e] text-black">
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="flex flex-col bg-black min-h-screen">
      {/* Hero Section */}
      <BackgroundPaths title="Welcome to Loop AI" />

      {/* Scroll Animation Section */}
      <ContainerScroll
        titleComponent={
          <h2 className="text-4xl md:text-6xl font-bold text-center mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#40bfae] to-[#7dd3c0]">
              See Loop AI in Action
            </span>
          </h2>
        }
      >
        <ChatUIDemo />
      </ContainerScroll>

      {/* Lamp Section */}
      <LampContainer>
        <h2 className="text-4xl md:text-6xl font-bold text-center mb-4">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#40bfae] to-[#7dd3c0]">
            AI-native team messaging platform.
          </span>
        </h2>
      </LampContainer>

      {/* Footer */}
      <footer className="py-8 px-4 md:px-6 bg-black border-t border-[#40bfae]/20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#40bfae] rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold text-black">◎</span>
            </div>
            <span className="font-semibold text-white">Loop AI</span>
          </div>
          <p className="text-sm text-neutral-500">
            © 2024 Loop AI. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Sign in link */}
      <div className="bg-black pb-8 pt-4 text-center">
        <p className="text-sm text-neutral-400">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-[#40bfae] underline underline-offset-2 hover:opacity-80"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}