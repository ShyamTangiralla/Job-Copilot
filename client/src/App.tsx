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
import JobOptimize from "@/pages/job-optimize";
import ResumeVault from "@/pages/resume-vault";
import CandidateProfilePage from "@/pages/candidate-profile";
import Tracker from "@/pages/tracker";
import SettingsPage from "@/pages/settings";
import JobIntake from "@/pages/job-intake";
import JobDiscovery from "@/pages/job-discovery";
import QuickCapture from "@/pages/quick-capture";
import ResumeVersionsPage from "@/pages/resume-versions";
import AnalyticsPage from "@/pages/analytics";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Overview} />
      <Route path="/intake" component={JobIntake} />
      <Route path="/discovery" component={JobDiscovery} />
      <Route path="/jobs" component={JobsInbox} />
      <Route path="/jobs/:id/optimize" component={JobOptimize} />
      <Route path="/jobs/:id" component={JobDetail} />
      <Route path="/resumes" component={ResumeVault} />
      <Route path="/resume-versions" component={ResumeVersionsPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/profile" component={CandidateProfilePage} />
      <Route path="/tracker" component={Tracker} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/quick-capture" component={QuickCapture} />
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
