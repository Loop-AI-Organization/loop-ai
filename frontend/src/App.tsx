import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PublicOnlyRoute } from "@/components/PublicOnlyRoute";
import { ProtectedAppBootstrap } from "@/components/ProtectedAppBootstrap";
import { HomeRoute } from "@/components/HomeRoute";
import { isSupabaseConfigured } from "@/lib/supabase";
import PromptPage from "./pages/PromptPage";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import SetupRequired from "./pages/SetupRequired";
import WorkspaceChannel from "./pages/WorkspaceChannel";
import WorkspaceSettings from "./pages/WorkspaceSettings";
import AccountSettings from "./pages/AccountSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  if (!isSupabaseConfigured) {
    return <SetupRequired />;
  }

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Landing page - redirects to /app if logged in */}
          <Route path="/" element={<HomeRoute />} />

          {/* Auth */}
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/signup" element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />
          <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />

          {/* Main app (protected + bootstrapped) */}
          <Route path="/app" element={<ProtectedAppBootstrap />}>
            <Route index element={<PromptPage />} />
            <Route path="account" element={<AccountSettings />} />
            <Route path=":workspaceId" element={<PromptPage />} />
            <Route path=":workspaceId/:channelId" element={<WorkspaceChannel />} />
            <Route path=":workspaceId/settings" element={<WorkspaceSettings />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
