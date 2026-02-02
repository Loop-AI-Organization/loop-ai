import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppPage from "./pages/App";
import Login from "./pages/Login";
import WorkspaceChannel from "./pages/WorkspaceChannel";
import WorkspaceSettings from "./pages/WorkspaceSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
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
          
          {/* Main app */}
          <Route path="/app" element={<AppPage />} />
          <Route path="/app/:workspaceId/:channelId" element={<WorkspaceChannel />} />
          <Route path="/app/:workspaceId/settings" element={<WorkspaceSettings />} />
          
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
