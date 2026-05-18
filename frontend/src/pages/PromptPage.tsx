"use client";

import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import AnimatedGradientBackground from "@/components/ui/animated-gradient-background";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import { useState } from "react";

export default function PromptPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = (message: string) => {
    console.log("Message sent:", message);
    setIsLoading(true);
    // Simulate AI processing then navigate to workspace
    setTimeout(() => {
      setIsLoading(false);
      navigate("/app");
    }, 1500);
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

          <nav className="flex items-center gap-6">
            <button
              onClick={() => navigate("/app")}
              className="text-neutral-400 hover:text-neutral-100 text-sm transition-colors"
            >
              Dashboard
            </button>
            <button
              onClick={() => navigate("/app")}
              className="text-neutral-400 hover:text-neutral-100 text-sm transition-colors"
            >
              Workspaces
            </button>
            <button
              onClick={() => navigate("/app")}
              className="text-neutral-400 hover:text-neutral-100 text-sm transition-colors"
            >
              Settings
            </button>
          </nav>
        </motion.header>

        {/* Main content - centered prompt box */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-24">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="w-full max-w-3xl"
          >
            {/* Welcome text */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-center mb-12"
            >
              <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#40bfae] to-[#7dd3c0] mb-4">
                What would you like to do?
              </h1>
              <p className="text-neutral-400 text-lg">
                Ask questions, search the web, brainstorm ideas, or create something new.
              </p>
            </motion.div>

            {/* Prompt input */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <PromptInputBox
                onSend={handleSend}
                isLoading={isLoading}
                placeholder="Ask anything..."
                className="w-full"
              />
            </motion.div>

            {/* Quick actions */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
            >
              {[
                "Show my workspaces",
                "Search for a file",
                "Create a new channel",
                "Help me brainstorm"
              ].map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleSend(action)}
                  className="px-4 py-2 rounded-full border border-neutral-700 bg-neutral-900/50 text-neutral-300 text-sm hover:border-[#40bfae]/50 hover:text-[#40bfae] transition-all duration-300 backdrop-blur-sm"
                >
                  {action}
                </button>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2"
          >
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-neutral-900/80 border border-[#40bfae]/30 backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-[#40bfae] animate-pulse" />
              <span className="text-neutral-300 text-sm">Processing...</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}