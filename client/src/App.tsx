import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Overview from "@/pages/overview";
import JobsInbox from "@/pages/jobs-inbox";
import JobDetail from "@/pages/job-detail";
import ResumeVault from "@/pages/resume-vault";
import CandidateProfilePage from "@/pages/candidate-profile";
import Tracker from "@/pages/tracker";
import SettingsPage from "@/pages/settings";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Overview} />
      <Route path="/jobs" component={JobsInbox} />
      <Route path="/jobs/:id" component={JobDetail} />
      <Route path="/resumes" component={ResumeVault} />
      <Route path="/profile" component={CandidateProfilePage} />
      <Route path="/tracker" component={Tracker} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "15rem",
  "--sidebar-width-icon": "3rem",
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <header className="flex items-center gap-2 p-2 border-b shrink-0">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
              </header>
              <main className="flex-1 overflow-auto">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
