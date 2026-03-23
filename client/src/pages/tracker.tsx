import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Send,
  SkipForward,
  MessageSquare,
  XCircle,
  Eye,
  Download,
  BarChart3,
  Columns3,
  List,
  Inbox,
  Flag,
  Trophy,
  Star,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Job } from "@shared/schema";
import { JOB_STATUSES } from "@shared/schema";

const KANBAN_COLUMNS = ["New", "Reviewed", "Ready to Apply", "Saved", "Applied", "Interview", "Final Round", "Offer", "Rejected", "No Response", "Skipped"] as const;

const columnColors: Record<string, string> = {
  New: "border-t-blue-500",
  Reviewed: "border-t-amber-500",
  "Ready to Apply": "border-t-violet-500",
  Saved: "border-t-sky-500",
  Applied: "border-t-emerald-500",
  Interview: "border-t-cyan-500",
  "Final Round": "border-t-indigo-500",
  Offer: "border-t-yellow-500",
  Rejected: "border-t-red-500",
  "No Response": "border-t-orange-400",
  Skipped: "border-t-gray-400",
};

const priorityIcon: Record<string, string> = {
  High: "text-red-500 dark:text-red-400",
  Medium: "text-amber-500 dark:text-amber-400",
  Low: "text-muted-foreground",
};

export default function Tracker() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("kanban");

  const { data: jobs, isLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const updateJob = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/jobs/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
  });

  const today = new Date().toISOString().split("T")[0];

  const stats = {
    total: jobs?.length ?? 0,
    newToday: jobs?.filter((j) => j.createdAt && new Date(j.createdAt).toISOString().split("T")[0] === today).length ?? 0,
    saved: jobs?.filter((j) => j.status === "Saved").length ?? 0,
    reviewed: jobs?.filter((j) => j.status === "Reviewed").length ?? 0,
    applied: jobs?.filter((j) => j.status === "Applied").length ?? 0,
    skipped: jobs?.filter((j) => j.status === "Skipped").length ?? 0,
    interviews: jobs?.filter((j) => j.status === "Interview" || j.status === "Final Round").length ?? 0,
    finalRound: jobs?.filter((j) => j.status === "Final Round").length ?? 0,
    offers: jobs?.filter((j) => j.status === "Offer").length ?? 0,
    rejected: jobs?.filter((j) => j.status === "Rejected").length ?? 0,
    noResponse: jobs?.filter((j) => j.status === "No Response").length ?? 0,
  };

  const bySource: Record<string, number> = {};
  const byResume: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const interviewsByResume: Record<string, number> = {};

  (jobs ?? []).forEach((j) => {
    if (j.source) bySource[j.source] = (bySource[j.source] ?? 0) + 1;
    if (j.roleClassification) byResume[j.roleClassification] = (byResume[j.roleClassification] ?? 0) + 1;
    if (j.createdAt) {
      const day = new Date(j.createdAt).toISOString().split("T")[0];
      byDay[day] = (byDay[day] ?? 0) + 1;
    }
    if (j.status === "Interview" && j.roleClassification) {
      interviewsByResume[j.roleClassification] = (interviewsByResume[j.roleClassification] ?? 0) + 1;
    }
  });

  const summaryCards = [
    { label: "Total Saved", value: stats.total, icon: Inbox, color: "text-blue-600 dark:text-blue-400" },
    { label: "Applied", value: stats.applied, icon: Send, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Interviews", value: stats.interviews, icon: MessageSquare, color: "text-cyan-600 dark:text-cyan-400" },
    { label: "Offers", value: stats.offers, icon: Trophy, color: "text-yellow-600 dark:text-yellow-400" },
    { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-red-500 dark:text-red-400" },
    { label: "No Response", value: stats.noResponse, icon: Star, color: "text-orange-500 dark:text-orange-400" },
  ];

  const statusColor: Record<string, string> = {
    New: "secondary",
    Reviewed: "secondary",
    "Ready to Apply": "secondary",
    Saved: "secondary",
    Applied: "default",
    Skipped: "secondary",
    Interview: "default",
    "Final Round": "default",
    Offer: "default",
    Rejected: "destructive",
    "No Response": "secondary",
  };

  const exportCSV = () => {
    window.open("/api/jobs/export/csv", "_blank");
    toast({ title: "CSV export started" });
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const jobId = parseInt(e.dataTransfer.getData("text/plain"));
    if (jobId) {
      updateJob.mutate({ id: jobId, status: newStatus });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragStart = (e: React.DragEvent, jobId: number) => {
    e.dataTransfer.setData("text/plain", jobId.toString());
  };

  const dayEntries = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const maxDayCount = Math.max(...dayEntries.map(([, c]) => c), 1);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">Track your application progress and pipeline.</p>
        </div>
        <Button variant="secondary" onClick={exportCSV} data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-1" />
          Export CSV
        </Button>
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="kanban" data-testid="tab-kanban">
            <Columns3 className="h-4 w-4 mr-1" />
            Kanban
          </TabsTrigger>
          <TabsTrigger value="table" data-testid="tab-table">
            <List className="h-4 w-4 mr-1" />
            Table
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="h-4 w-4 mr-1" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {KANBAN_COLUMNS.map((status) => {
                const columnJobs = (jobs ?? []).filter((j) => j.status === status);
                return (
                  <div
                    key={status}
                    className={`min-w-[220px] flex-1 rounded-md bg-muted/30 border-t-2 ${columnColors[status]}`}
                    onDrop={(e) => handleDrop(e, status)}
                    onDragOver={handleDragOver}
                    data-testid={`kanban-column-${status.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <div className="p-3 pb-2 flex items-center justify-between gap-1">
                      <span className="text-sm font-medium">{status}</span>
                      <Badge variant="secondary" className="text-xs">{columnJobs.length}</Badge>
                    </div>
                    <div className="px-2 pb-2 space-y-2 min-h-[120px]">
                      {columnJobs.map((job) => (
                        <div
                          key={job.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, job.id)}
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className="rounded-md bg-background border p-2.5 cursor-pointer hover-elevate"
                          data-testid={`kanban-card-${job.id}`}
                        >
                          <p className="text-sm font-medium truncate">{job.title}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{job.company}</p>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {job.applyPriorityScore > 0 && (
                              <Badge variant={job.applyPriorityScore >= 75 ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                                {job.applyPriorityScore}
                              </Badge>
                            )}
                            {job.fitLabel && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {job.fitLabel}
                              </Badge>
                            )}
                            {job.priority !== "Medium" && (
                              <Flag className={`h-3 w-3 ${priorityIcon[job.priority]}`} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <Card>
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
                        <TableHead>Apply Score</TableHead>
                        <TableHead>Apply Priority</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Classification</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Fit</TableHead>
                        <TableHead>Follow-up</TableHead>
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
                          <TableCell>
                            <span className="text-sm font-medium">{job.applyPriorityScore > 0 ? job.applyPriorityScore : "—"}</span>
                          </TableCell>
                          <TableCell>
                            {job.applyPriorityLabel ? (
                              <Badge variant={job.applyPriorityLabel === "Apply Immediately" || job.applyPriorityLabel === "High Priority" ? "default" : job.applyPriorityLabel === "Medium Priority" ? "secondary" : "outline"} className="text-xs">
                                {job.applyPriorityLabel}
                              </Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium ${priorityIcon[job.priority]}`}>
                              {job.priority}
                            </span>
                          </TableCell>
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
                            {job.followUpDate || "-"}
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
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Applications by Day</CardTitle>
              </CardHeader>
              <CardContent>
                {dayEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {dayEntries.map(([day, count]) => (
                      <div key={day} className="space-y-1">
                        <div className="flex items-center justify-between gap-1 text-sm">
                          <span className="text-muted-foreground text-xs">{day}</span>
                          <span className="font-medium text-sm">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${(count / maxDayCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Applications by Source</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(bySource).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No source data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(bySource)
                      .sort((a, b) => b[1] - a[1])
                      .map(([source, count]) => {
                        const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                        return (
                          <div key={source} className="space-y-1">
                            <div className="flex items-center justify-between gap-1 text-sm">
                              <span className="text-muted-foreground">{source}</span>
                              <span className="font-medium">{count}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-chart-2 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Interviews by Resume Type</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(interviewsByResume).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No interview data yet.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(interviewsByResume)
                      .sort((a, b) => b[1] - a[1])
                      .map(([role, count]) => (
                        <div key={role} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-cyan-500" />
                            <span className="text-sm text-muted-foreground">{role}</span>
                          </div>
                          <span className="text-lg font-bold">{count}</span>
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
                {Object.keys(byResume).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(byResume)
                      .sort((a, b) => b[1] - a[1])
                      .map(([role, count]) => {
                        const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                        return (
                          <div key={role} className="space-y-1">
                            <div className="flex items-center justify-between gap-1 text-sm">
                              <span className="text-muted-foreground">{role}</span>
                              <span className="font-medium">{count}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-chart-4 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">Pipeline Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-32">
                  {JOB_STATUSES.map((status) => {
                    const count = (jobs ?? []).filter((j) => j.status === status).length;
                    const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                    return (
                      <div key={status} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-medium">{count}</span>
                        <div className="w-full bg-muted rounded-t-sm relative" style={{ height: "100px" }}>
                          <div
                            className="absolute bottom-0 w-full bg-primary rounded-t-sm transition-all"
                            style={{ height: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground text-center leading-tight">{status}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
