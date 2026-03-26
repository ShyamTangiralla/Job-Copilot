import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Inbox,
  CheckCircle,
  Send,
  SkipForward,
  MessageSquare,
  XCircle,
  TrendingUp,
  TrendingDown,
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
  Target,
  Activity,
} from "lucide-react";
import { Link } from "wouter";
import type { Job, Resume } from "@shared/schema";

// ─── Score Types ──────────────────────────────────────────────────────────────
interface ScoreComponent {
  label: string;
  value: number;
  target: number;
  maxPts: number;
  unit: string;
  pts: number;
  pct: number;
}

interface JobSearchScore {
  score: number;
  grade: string;
  scoreDelta: number | null;
  components: ScoreComponent[];
  trend: { week: string; score: number }[];
}

// ─── Score gauge (SVG ring) ───────────────────────────────────────────────────
function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color =
    grade === "Excellent" ? "#10b981" :
    grade === "Good"      ? "#3b82f6" :
    grade === "Fair"      ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color }} data-testid="text-job-score">{score}</span>
        <span className="text-[10px] text-muted-foreground font-medium mt-0.5">{grade}</span>
      </div>
    </div>
  );
}

// ─── Component bar ────────────────────────────────────────────────────────────
function ComponentBar({ c }: { c: ScoreComponent }) {
  const full = c.pts === c.maxPts;
  const color = full ? "bg-emerald-500" : c.pct >= 50 ? "bg-blue-500" : "bg-amber-400";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">{c.label}</span>
        <span className="text-xs font-medium tabular-nums shrink-0">
          {c.value}{c.unit === "%" ? "%" : ""}&nbsp;
          <span className="text-muted-foreground font-normal">({c.pts}/{c.maxPts})</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${c.pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ScoreTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md shadow-md px-3 py-2 text-xs">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-muted-foreground">Score: <span className="font-semibold text-foreground">{payload[0]?.value}</span>/100</p>
    </div>
  );
}

export default function Overview() {
  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });
  const { data: resumes, isLoading: resumesLoading } = useQuery<Resume[]>({
    queryKey: ["/api/resumes"],
  });
  const { data: scoreData, isLoading: scoreLoading } = useQuery<JobSearchScore>({
    queryKey: ["/api/job-search-score"],
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

  // Grade color helpers
  const gradeColor = (grade: string) =>
    grade === "Excellent" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800" :
    grade === "Good"      ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800" :
    grade === "Fair"      ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" :
                            "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800";

  const trendLineColor = (grade: string) =>
    grade === "Excellent" ? "#10b981" :
    grade === "Good"      ? "#3b82f6" :
    grade === "Fair"      ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Your job application dashboard at a glance.</p>
      </div>

      {/* ── Job Search Score ───────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">Job Search Score</CardTitle>
            <span className="text-xs text-muted-foreground ml-1">— updated in real-time based on your weekly activity</span>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {scoreLoading ? (
            <div className="flex gap-6">
              <Skeleton className="w-36 h-36 rounded-full" />
              <div className="flex-1 space-y-3 pt-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            </div>
          ) : !scoreData ? (
            <p className="text-sm text-muted-foreground py-4">Score unavailable.</p>
          ) : (
            <div className="space-y-5">
              {/* Top row: gauge + components + trend */}
              <div className="flex flex-col md:flex-row gap-6">
                {/* Gauge + grade + delta */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <ScoreGauge score={scoreData.score} grade={scoreData.grade} />
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${gradeColor(scoreData.grade)}`}>
                    {scoreData.grade}
                  </span>
                  {scoreData.scoreDelta !== null && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {scoreData.scoreDelta > 0 ? (
                        <><TrendingUp className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600 dark:text-emerald-400 font-medium">+{scoreData.scoreDelta}</span> vs last week</>
                      ) : scoreData.scoreDelta < 0 ? (
                        <><TrendingDown className="h-3 w-3 text-red-500" /><span className="text-red-500 font-medium">{scoreData.scoreDelta}</span> vs last week</>
                      ) : (
                        <><Minus className="h-3 w-3" /> Same as last week</>
                      )}
                    </div>
                  )}
                </div>

                {/* Component breakdown */}
                <div className="flex-1 min-w-0 space-y-2.5 justify-center flex flex-col">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Score breakdown</p>
                  {scoreData.components.map((c) => (
                    <ComponentBar key={c.label} c={c} />
                  ))}
                </div>

                {/* 8-week trend */}
                <div className="md:w-56 shrink-0">
                  <p className="text-xs font-medium text-muted-foreground mb-2">8-week trend</p>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={scoreData.trend} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="week" tick={{ fontSize: 8 }} interval={1} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Tooltip content={<ScoreTooltip />} />
                      <ReferenceLine y={70} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke={trendLineColor(scoreData.grade)}
                        strokeWidth={2}
                        dot={{ r: 3, fill: trendLineColor(scoreData.grade) }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-[10px] text-muted-foreground text-center mt-0.5">— 70 = "Good" threshold</p>
                </div>
              </div>

              {/* Tip based on weakest component */}
              {(() => {
                const weakest = [...scoreData.components].sort((a, b) => a.pct - b.pct)[0];
                if (!weakest || weakest.pct >= 80) return null;
                const tips: Record<string, string> = {
                  "Applications this week": "Try to submit at least 5–8 applications this week to boost your score.",
                  "Active interviews": "Keep pushing — interviews are the biggest score driver. Apply to more strong-match jobs.",
                  "Follow-ups sent": "Log follow-ups in your Networking Tracker by updating the Last Contact Date.",
                  "Networking contacts": "Add new contacts in the Networking Tracker to increase your score.",
                  "Conversion rate": "Focus on higher-match jobs and tailor your resume with ATS scoring to improve your conversion.",
                  "Resume ATS score": "Use the Resume Optimizer to score your resume against target jobs and boost your ATS score.",
                };
                return (
                  <div className="rounded-md bg-muted/50 border border-border px-3 py-2 flex items-start gap-2">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Tip: </span>
                      {tips[weakest.label] ?? `Focus on improving "${weakest.label}" to raise your score.`}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

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
