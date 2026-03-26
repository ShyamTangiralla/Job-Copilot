import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Inbox,
  FileText,
  User,
  Settings,
  Briefcase,
  Bookmark,
  History,
  LineChart,
  MessageSquare,
  Trophy,
  Users,
  PieChart,
  Search,
  ArrowDownToLine,
  KanbanSquare,
  FileDown,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";

const navGroups = [
  {
    label: "Dashboard",
    items: [
      { title: "Overview", url: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "Discover",
    items: [
      { title: "Job Discovery", url: "/discovery", icon: Search },
      { title: "Import Jobs", url: "/intake", icon: ArrowDownToLine },
      { title: "Quick Capture", url: "/quick-capture", icon: Bookmark },
    ],
  },
  {
    label: "Applications",
    items: [
      { title: "Jobs Inbox", url: "/jobs", icon: Inbox },
      { title: "Pipeline", url: "/tracker", icon: KanbanSquare },
      { title: "Interview Tracker", url: "/interviews", icon: MessageSquare },
      { title: "Offer Tracker", url: "/offers", icon: Trophy },
      { title: "Networking", url: "/networking", icon: Users },
    ],
  },
  {
    label: "Resumes",
    items: [
      { title: "Resume Vault", url: "/resumes", icon: FileText },
      { title: "Resume Versions", url: "/resume-versions", icon: History },
      { title: "Candidate Profile", url: "/profile", icon: User },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Analytics", url: "/analytics", icon: LineChart },
      { title: "Job Search Summary", url: "/summary", icon: PieChart },
      { title: "Export Center", url: "/export", icon: FileDown },
    ],
  },
  {
    label: "Configure",
    items: [
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Briefcase className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold" data-testid="text-app-title">Job Copilot</h2>
            <p className="text-xs text-muted-foreground">Application Manager</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild data-active={isActive}>
                        <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
