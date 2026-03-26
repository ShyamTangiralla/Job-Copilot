import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Inbox,
  CheckCircle,
  Send,
  SkipForward,
  MessageSquare,
  XCircle,
  TrendingUp,
  FileText,
  Clock,
  Timer,
  Zap,
  ArrowUp,
  Minus,
  ArrowDown,
  Bell,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import type { Job, Resume } from "@shared/schema";

export default function Overview() {
  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });
  const { data: resumes, isLoading: resumesLoading } = useQuery<Resume[]>({
    queryKey: ["/api/resumes"],
  });

  const isLoading = jobsLoading || resumesLoading;

  const stats = {
    total: jobs?.length ?? 0,
    newJobs: jobs?.filter((j) => j.status === "New").length ?? 0,
    reviewed: jobs?.filter((j) => j.status === "Reviewed").length ?? 0,
    readyToApply: jobs?.filter((j) => j.status === "Ready to Apply").length ?? 0,
    applied: jobs?.filter((j) => j.status === "Applied").length ?? 0,
    skipped: jobs?.filter((j) => j.status === "Skipped").length ?? 0,
    interviews: jobs?.filter((j) => j.status === "Interview").length ?? 0,
    rejected: jobs?.filter((j) => j.status === "Rejected").length ?? 0,
    activeResumes: resumes?.filter((r) => r.active).length ?? 0,
    fresh24h: jobs?.filter((j) => j.freshnessLabel === "Fresh 24h").length ?? 0,
    fresh48h: jobs?.filter((j) => j.freshnessLabel === "Fresh 48h").length ?? 0,
    applyImmediately: jobs?.filter((j) => j.applyPriorityLabel === "Apply Immediately").length ?? 0,
    highPriority: jobs?.filter((j) => j.applyPriorityLabel === "High Priority").length ?? 0,
    mediumPriority: jobs?.filter((j) => j.applyPriorityLabel === "Medium Priority").length ?? 0,
    lowPriority: jobs?.filter((j) => j.applyPriorityLabel === "Low Priority").length ?? 0,
  };

  const recentJobs = jobs?.slice(0, 5) ?? [];

  const today = new Date();
  const reminders = (jobs ?? []).filter(job => {
    if (job.status === "Applied" && job.dateApplied) {
      const days = Math.floor((today.getTime() - new Date(job.dateApplied).getTime()) / 86400000);
      return days >= 5;
    }
    if ((job.status === "Interview" || job.status === "Final Round") && job.interviewDate) {
      const days = Math.floor((today.getTime() - new Date(job.interviewDate).getTime()) / 86400000);
      return days >= 3 && !job.interviewResult;
    }
    return false;
  }).slice(0, 5);

  function reminderLabel(job: Job) {
    if (job.status === "Applied" && job.dateApplied) {
      const days = Math.floor((today.getTime() - new Date(job.dateApplied).getTime()) / 86400000);
      return { text: `No response after ${days} days`, type: "stale" as const };
    }
    return { text: "Follow up after interview", type: "interview" as const };
  }

  const statCards = [
    { label: "Total Jobs", value: stats.total, icon: Inbox, color: "text-blue-600 dark:text-blue-400" },
    { label: "New", value: stats.newJobs, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Fresh 24h", value: stats.fresh24h, icon: Clock, color: "text-green-600 dark:text-green-400" },
    { label: "Fresh 48h", value: stats.fresh48h, icon: Timer, color: "text-teal-600 dark:text-teal-400" },
    { label: "Reviewed", value: stats.reviewed, icon: CheckCircle, color: "text-amber-600 dark:text-amber-400" },
    { label: "Applied", value: stats.applied, icon: Send, color: "text-violet-600 dark:text-violet-400" },
    { label: "Interviews", value: stats.interviews, icon: MessageSquare, color: "text-cyan-600 dark:text-cyan-400" },
    { label: "Skipped", value: stats.skipped, icon: SkipForward, color: "text-muted-foreground" },
    { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-red-500 dark:text-red-400" },
    { label: "Active Resumes", value: stats.activeResumes, icon: FileText, color: "text-indigo-600 dark:text-indigo-400" },
  ];

  const priorityCards = [
    { label: "Apply Immediately", value: stats.applyImmediately, icon: Zap, color: "text-red-600 dark:text-red-400" },
    { label: "High Priority", value: stats.highPriority, icon: ArrowUp, color: "text-orange-600 dark:text-orange-400" },
    { label: "Medium Priority", value: stats.mediumPriority, icon: Minus, color: "text-amber-600 dark:text-amber-400" },
    { label: "Low Priority", value: stats.lowPriority, icon: ArrowDown, color: "text-muted-foreground" },
  ];

  const statusColor: Record<string, string> = {
    New: "secondary",
    Reviewed: "default",
    "Ready to Apply": "default",
    Applied: "default",
    Skipped: "secondary",
    Interview: "default",
    Rejected: "destructive",
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Your job application dashboard at a glance.</p>
      </div>

      {/* Follow-up Reminders */}
      {!isLoading && reminders.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Follow-up Reminders
            </span>
            <Badge className="text-[10px] bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-300 border-0 ml-auto">
              {reminders.length}
            </Badge>
          </div>
          {reminders.map(job => {
            const rem = reminderLabel(job);
            return (
              <Link key={job.id} href={`/jobs/${job.id}`}>
                <div className="flex items-center gap-3 rounded-md bg-white dark:bg-amber-950/40 px-3 py-2 border border-amber-100 dark:border-amber-800/50 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors cursor-pointer"
                  data-testid={`reminder-job-${job.id}`}>
                  <AlertCircle className={`h-4 w-4 shrink-0 ${rem.type === "stale" ? "text-amber-500" : "text-cyan-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{job.title}</p>
                    <p className="text-[10px] text-muted-foreground">{job.company} · {rem.text}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              </Link>
            );
          })}
          {reminders.length === 5 && (
            <Link href="/interviews">
              <div className="block text-xs text-amber-700 dark:text-amber-400 hover:underline text-center pt-1 cursor-pointer">
                View all in Interview Tracker →
              </div>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading
          ? Array.from({ length: 10 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-12" />
                </CardContent>
              </Card>
            ))
          : statCards.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                  <p className="text-2xl font-bold" data-testid={`text-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    {stat.value}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-12" />
                </CardContent>
              </Card>
            ))
          : priorityCards.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                  <p className="text-2xl font-bold" data-testid={`text-priority-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    {stat.value}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No jobs added yet. Go to Jobs Inbox to add some.
              </p>
            ) : (
              <div className="space-y-2">
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between gap-2 rounded-md p-2 bg-muted/40"
                    data-testid={`card-recent-job-${job.id}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{job.company}</p>
                    </div>
                    <Badge variant={statusColor[job.status] as any ?? "secondary"} className="shrink-0 text-xs">
                      {job.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Applications by Role Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {["Data Analyst", "Healthcare Data Analyst", "Healthcare Analyst", "Business Analyst", "Unknown"].map(
                  (role) => {
                    const count = jobs?.filter((j) => j.roleClassification === role).length ?? 0;
                    const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                    return (
                      <div key={role} className="space-y-1">
                        <div className="flex items-center justify-between gap-1 text-sm">
                          <span className="text-muted-foreground">{role}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
