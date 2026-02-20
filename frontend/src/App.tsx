import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { isSupabaseConfigured } from "@/lib/supabase";
import AppPage from "./pages/App";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import SetupRequired from "./pages/SetupRequired";
import WorkspaceChannel from "./pages/WorkspaceChannel";
import WorkspaceSettings from "./pages/WorkspaceSettings";
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
      <BrowserRouter>
        <Routes>
          {/* Redirect root to app */}
          <Route path="/" element={<Navigate to="/app" replace />} />

          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Main app (protected) */}
          <Route path="/app" element={<ProtectedRoute><AppPage /></ProtectedRoute>} />
          <Route path="/app/:workspaceId/:channelId" element={<ProtectedRoute><WorkspaceChannel /></ProtectedRoute>} />
          <Route path="/app/:workspaceId/settings" element={<ProtectedRoute><WorkspaceSettings /></ProtectedRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
