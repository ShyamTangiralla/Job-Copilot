import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Inbox,
  CheckCircle,
  Send,
  SkipForward,
  MessageSquare,
  XCircle,
  Clock,
  Eye,
} from "lucide-react";
import type { Job } from "@shared/schema";

export default function Tracker() {
  const [, navigate] = useLocation();
  const { data: jobs, isLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const today = new Date().toISOString().split("T")[0];

  const stats = {
    total: jobs?.length ?? 0,
    newToday: jobs?.filter((j) => j.createdAt && new Date(j.createdAt).toISOString().split("T")[0] === today).length ?? 0,
    reviewed: jobs?.filter((j) => j.status === "Reviewed").length ?? 0,
    applied: jobs?.filter((j) => j.status === "Applied").length ?? 0,
    skipped: jobs?.filter((j) => j.status === "Skipped").length ?? 0,
    interviews: jobs?.filter((j) => j.status === "Interview").length ?? 0,
    rejected: jobs?.filter((j) => j.status === "Rejected").length ?? 0,
  };

  const bySource: Record<string, number> = {};
  const byResume: Record<string, number> = {};
  (jobs ?? []).forEach((j) => {
    if (j.source) bySource[j.source] = (bySource[j.source] ?? 0) + 1;
    if (j.roleClassification) byResume[j.roleClassification] = (byResume[j.roleClassification] ?? 0) + 1;
  });

  const summaryCards = [
    { label: "Added Today", value: stats.newToday, icon: Inbox, color: "text-blue-600 dark:text-blue-400" },
    { label: "Reviewed", value: stats.reviewed, icon: Eye, color: "text-amber-600 dark:text-amber-400" },
    { label: "Applied", value: stats.applied, icon: Send, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Skipped", value: stats.skipped, icon: SkipForward, color: "text-muted-foreground" },
    { label: "Interviews", value: stats.interviews, icon: MessageSquare, color: "text-cyan-600 dark:text-cyan-400" },
    { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-red-500 dark:text-red-400" },
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
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Tracker</h1>
        <p className="text-sm text-muted-foreground mt-1">Track your application progress and pipeline.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-16 mb-2" />
                  <Skeleton className="h-8 w-10" />
                </CardContent>
              </Card>
            ))
          : summaryCards.map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <p className="text-2xl font-bold" data-testid={`text-tracker-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    {s.value}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">By Source</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : Object.keys(bySource).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No source data yet.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(bySource)
                  .sort((a, b) => b[1] - a[1])
                  .map(([source, count]) => (
                    <div key={source} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">{source}</span>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">By Resume Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : Object.keys(byResume).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No classification data yet.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(byResume)
                  .sort((a, b) => b[1] - a[1])
                  .map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">{role}</span>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">All Applications ({stats.total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-muted-foreground">No jobs tracked yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Job Title</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Classification</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fit</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      data-testid={`row-tracker-job-${job.id}`}
                    >
                      <TableCell className="font-medium">{job.title}</TableCell>
                      <TableCell>{job.company}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{job.source}</TableCell>
                      <TableCell className="text-sm">{job.roleClassification}</TableCell>
                      <TableCell>
                        <Badge variant={statusColor[job.status] as any ?? "secondary"} className="text-xs">
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {job.fitLabel && (
                          <Badge variant="secondary" className="text-xs">{job.fitLabel}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.datePosted || (job.createdAt ? new Date(job.createdAt).toLocaleDateString() : "")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
