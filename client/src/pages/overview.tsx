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
} from "lucide-react";
import type { Job, Resume } from "@shared/schema";

export default function Overview() {
  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });
  const { data: resumes, isLoading: resumesLoading } = useQuery<Resume[]>({
    queryKey: ["/api/resumes"],
  });

  const isLoading = jobsLoading || resumesLoading;

  const today = new Date().toISOString().split("T")[0];

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
  };

  const recentJobs = jobs?.slice(0, 5) ?? [];

  const statCards = [
    { label: "Total Jobs", value: stats.total, icon: Inbox, color: "text-blue-600 dark:text-blue-400" },
    { label: "New", value: stats.newJobs, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Reviewed", value: stats.reviewed, icon: CheckCircle, color: "text-amber-600 dark:text-amber-400" },
    { label: "Applied", value: stats.applied, icon: Send, color: "text-violet-600 dark:text-violet-400" },
    { label: "Interviews", value: stats.interviews, icon: MessageSquare, color: "text-cyan-600 dark:text-cyan-400" },
    { label: "Skipped", value: stats.skipped, icon: SkipForward, color: "text-muted-foreground" },
    { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-red-500 dark:text-red-400" },
    { label: "Active Resumes", value: stats.activeResumes, icon: FileText, color: "text-indigo-600 dark:text-indigo-400" },
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
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
