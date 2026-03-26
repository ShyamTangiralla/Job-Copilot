import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Send, MessageSquare, Trophy, TrendingUp, TrendingDown,
  Clock, Target, Activity, Bell, AlertCircle, ChevronRight,
  Minus, ArrowRight, Inbox, Zap, Users, BarChart3,
} from "lucide-react";
import { Link } from "wouter";
import type { Job, Resume } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ScoreComponent {
  label: string; value: number; target: number;
  maxPts: number; unit: string; pts: number; pct: number;
}
interface JobSearchScore {
  score: number; grade: string; scoreDelta: number | null;
  components: ScoreComponent[];
  trend: { week: string; score: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isThisWeek(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 86400000;
  return diff >= 0 && diff < 7;
}
function isLastWeek(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 86400000;
  return diff >= 7 && diff < 14;
}

// ─── Score gauge ──────────────────────────────────────────────────────────────
function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const r = 48;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color =
    grade === "Excellent" ? "#10b981" :
    grade === "Good"      ? "#3b82f6" :
    grade === "Fair"      ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      <svg width="120" height="120" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="11" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="11"
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums" style={{ color }} data-testid="text-job-score">{score}</span>
        <span className="text-[10px] text-muted-foreground font-medium">{grade}</span>
      </div>
    </div>
  );
}

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
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${c.pct}%` }} />
      </div>
    </div>
  );
}

function ScoreTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md shadow-md px-3 py-2 text-xs">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-muted-foreground">Score: <span className="font-semibold text-foreground">{payload[0]?.value}</span>/100</p>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  delta?: number | null;
  deltaLabel?: string;
  highlight?: boolean;
  testId?: string;
}
function KpiCard({ label, value, sub, icon: Icon, iconColor, delta, deltaLabel, highlight, testId }: KpiCardProps) {
  return (
    <Card className={highlight ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-muted-foreground leading-tight">{label}</span>
          <div className={`p-1.5 rounded-md bg-muted/60`}>
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
        </div>
        <p className="text-2xl font-bold tabular-nums leading-none" data-testid={testId}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {delta != null && (
          <div className={`flex items-center gap-1 mt-1.5 text-xs ${delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-red-500" : "text-muted-foreground"}`}>
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            <span>{delta > 0 ? `+${delta}` : delta} {deltaLabel ?? "vs last week"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pipeline stage ───────────────────────────────────────────────────────────
function PipelineStage({ label, count, color, isLast }: { label: string; count: number; color: string; isLast?: boolean }) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <div className="flex-1 min-w-0">
        <div className={`rounded-lg p-3 text-center border ${color}`}>
          <p className="text-xl font-bold tabular-nums">{count}</p>
          <p className="text-xs font-medium mt-0.5 truncate">{label}</p>
        </div>
      </div>
      {!isLast && <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Overview() {
  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: resumes } = useQuery<Resume[]>({ queryKey: ["/api/resumes"] });
  const { data: scoreData, isLoading: scoreLoading } = useQuery<JobSearchScore>({
    queryKey: ["/api/job-search-score"],
  });

  const isLoading = jobsLoading;

  // ── Derived stats ────────────────────────────────────────────────────────────
  const APPLIED_STATUSES = new Set(["Applied", "Interview", "Final Round", "Offer", "Rejected", "No Response"]);
  const INTERVIEW_STATUSES = new Set(["Interview", "Final Round", "Offer"]);

  const allApplied = (jobs ?? []).filter(j => APPLIED_STATUSES.has(j.status));
  const allInterviewed = (jobs ?? []).filter(j => INTERVIEW_STATUSES.has(j.status));
  const allOffers = (jobs ?? []).filter(j => j.status === "Offer");

  const appsThisWeek = (jobs ?? []).filter(j => isThisWeek(j.dateApplied)).length;
  const appsLastWeek = (jobs ?? []).filter(j => isLastWeek(j.dateApplied)).length;
  const appsDelta = appsThisWeek - appsLastWeek;

  const interviewsThisWeek = (jobs ?? []).filter(j => isThisWeek(j.interviewDate)).length;
  const interviewsLastWeek = (jobs ?? []).filter(j => isLastWeek(j.interviewDate)).length;
  const interviewsDelta = interviewsThisWeek - interviewsLastWeek;

  const conversionRate = allApplied.length > 0
    ? Math.round(allInterviewed.length / allApplied.length * 100)
    : 0;

  // Average response time (days: dateApplied → interviewDate)
  const responseTimes = allInterviewed
    .filter(j => j.dateApplied && j.interviewDate)
    .map(j => (new Date(j.interviewDate!).getTime() - new Date(j.dateApplied!).getTime()) / 86400000)
    .filter(d => d >= 0 && d < 365);
  const avgResponseDays = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null;

  // Pipeline counts
  const pipeline = [
    { label: "Discovered", count: (jobs ?? []).length, color: "border-slate-200 bg-slate-50 dark:bg-slate-900/30 dark:border-slate-700 text-slate-700 dark:text-slate-300" },
    { label: "Applied", count: allApplied.length, color: "border-violet-200 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-700 text-violet-700 dark:text-violet-300" },
    { label: "Interviewed", count: allInterviewed.length, color: "border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 text-blue-700 dark:text-blue-300" },
    { label: "Offers", count: allOffers.length, color: "border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300" },
  ];

  // Recent applied jobs (last 5)
  const recentApplied = [...allApplied]
    .filter(j => j.dateApplied)
    .sort((a, b) => new Date(b.dateApplied!).getTime() - new Date(a.dateApplied!).getTime())
    .slice(0, 5);

  // Follow-up reminders
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
  }).slice(0, 4);

  function reminderLabel(job: Job) {
    if (job.status === "Applied" && job.dateApplied) {
      const days = Math.floor((today.getTime() - new Date(job.dateApplied).getTime()) / 86400000);
      return `No response after ${days}d`;
    }
    return "Follow up after interview";
  }

  // Grade helpers
  const gradeColor = (grade: string) =>
    grade === "Excellent" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800" :
    grade === "Good"      ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800" :
    grade === "Fair"      ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" :
                            "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800";
  const trendLineColor = (grade: string) =>
    grade === "Excellent" ? "#10b981" : grade === "Good" ? "#3b82f6" : grade === "Fair" ? "#f59e0b" : "#ef4444";

  const statusBadgeVariant: Record<string, string> = {
    Applied: "default", Interview: "default", "Final Round": "default",
    Offer: "default", Rejected: "destructive", "No Response": "secondary",
  };

  // Role breakdown (top 4)
  const roleMap: Record<string, number> = {};
  for (const j of (jobs ?? [])) {
    const r = j.roleClassification || "Unknown";
    roleMap[r] = (roleMap[r] ?? 0) + 1;
  }
  const topRoles = Object.entries(roleMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalJobs = (jobs ?? []).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Your job search at a glance.</p>
        </div>
        <Link href="/jobs">
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" data-testid="link-go-to-inbox">
            <Inbox className="h-3.5 w-3.5" />
            Jobs Inbox
          </Button>
        </Link>
      </div>

      {/* ── 6 Hero KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-7 w-12" /></CardContent></Card>
          ))
        ) : (
          <>
            <KpiCard
              label="Applications This Week"
              value={appsThisWeek}
              icon={Send}
              iconColor="text-violet-600 dark:text-violet-400"
              delta={appsDelta}
              deltaLabel="vs last week"
              testId="text-kpi-apps-week"
            />
            <KpiCard
              label="Interviews This Week"
              value={interviewsThisWeek}
              icon={MessageSquare}
              iconColor="text-blue-600 dark:text-blue-400"
              delta={interviewsDelta}
              deltaLabel="vs last week"
              testId="text-kpi-interviews-week"
            />
            <KpiCard
              label="Offers"
              value={allOffers.length}
              sub={allOffers.length === 1 ? "1 active offer" : allOffers.length > 1 ? `${allOffers.length} active offers` : "None yet"}
              icon={Trophy}
              iconColor="text-amber-600 dark:text-amber-400"
              testId="text-kpi-offers"
            />
            <KpiCard
              label="Conversion Rate"
              value={`${conversionRate}%`}
              sub={`${allInterviewed.length} of ${allApplied.length} applied`}
              icon={TrendingUp}
              iconColor="text-emerald-600 dark:text-emerald-400"
              testId="text-kpi-conversion"
            />
            <KpiCard
              label="Avg Response Time"
              value={avgResponseDays != null ? `${avgResponseDays}d` : "—"}
              sub={avgResponseDays != null ? "applied → interview" : "No data yet"}
              icon={Clock}
              iconColor="text-cyan-600 dark:text-cyan-400"
              testId="text-kpi-response-time"
            />
            <KpiCard
              label="Job Search Score"
              value={scoreLoading ? "…" : scoreData ? scoreData.score : "—"}
              sub={scoreLoading ? "" : scoreData ? scoreData.grade : ""}
              icon={Target}
              iconColor="text-primary"
              highlight
              testId="text-kpi-score"
            />
          </>
        )}
      </div>

      {/* ── Pipeline Funnel ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Application Pipeline
            </CardTitle>
            <Link href="/analytics">
              <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                Full analytics →
              </span>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {isLoading ? (
            <div className="flex gap-2"><Skeleton className="flex-1 h-16" /><Skeleton className="flex-1 h-16" /><Skeleton className="flex-1 h-16" /><Skeleton className="flex-1 h-16" /></div>
          ) : (
            <div className="flex items-center gap-1">
              {pipeline.map((stage, i) => (
                <PipelineStage key={stage.label} {...stage} isLast={i === pipeline.length - 1} />
              ))}
            </div>
          )}
          {!isLoading && allApplied.length > 0 && (
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span>Interview rate: <span className="font-medium text-foreground">{conversionRate}%</span></span>
              {avgResponseDays != null && (
                <span>Avg days to interview: <span className="font-medium text-foreground">{avgResponseDays}d</span></span>
              )}
              {allOffers.length > 0 && (
                <span>Offer rate: <span className="font-medium text-foreground">{allApplied.length > 0 ? Math.round(allOffers.length / allApplied.length * 100) : 0}%</span></span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Follow-up Reminders ───────────────────────────────────────────────── */}
      {!isLoading && reminders.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Follow-up Reminders</span>
            <Badge className="ml-auto text-[10px] bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-300 border-0">
              {reminders.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {reminders.map(job => (
              <Link key={job.id} href={`/jobs/${job.id}`}>
                <div className="flex items-center gap-2.5 rounded-md bg-white dark:bg-amber-950/40 px-3 py-2 border border-amber-100 dark:border-amber-800/50 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors cursor-pointer"
                  data-testid={`reminder-job-${job.id}`}>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{job.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{job.company} · {reminderLabel(job)}</p>
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Job Search Score (full widget) ────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">Job Search Score</CardTitle>
            <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">— real-time weekly activity score</span>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {scoreLoading ? (
            <div className="flex gap-6">
              <Skeleton className="w-32 h-32 rounded-full" />
              <div className="flex-1 space-y-3 pt-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            </div>
          ) : !scoreData ? (
            <p className="text-sm text-muted-foreground py-4">Score unavailable.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Gauge + grade + delta */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <ScoreGauge score={scoreData.score} grade={scoreData.grade} />
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${gradeColor(scoreData.grade)}`}>
                    {scoreData.grade}
                  </span>
                  {scoreData.scoreDelta !== null && (
                    <div className={`flex items-center gap-1 text-xs ${scoreData.scoreDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : scoreData.scoreDelta < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {scoreData.scoreDelta > 0 ? <TrendingUp className="h-3 w-3" /> : scoreData.scoreDelta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      <span>{scoreData.scoreDelta > 0 ? `+${scoreData.scoreDelta}` : scoreData.scoreDelta} vs last week</span>
                    </div>
                  )}
                </div>

                {/* Component breakdown */}
                <div className="flex-1 min-w-0 space-y-2.5 flex flex-col justify-center">
                  <p className="text-xs font-medium text-muted-foreground">Score breakdown</p>
                  {scoreData.components.map((c) => <ComponentBar key={c.label} c={c} />)}
                </div>

                {/* 8-week trend */}
                <div className="md:w-52 shrink-0">
                  <p className="text-xs font-medium text-muted-foreground mb-2">8-week trend</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={scoreData.trend} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="week" tick={{ fontSize: 8 }} interval={1} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Tooltip content={<ScoreTooltip />} />
                      <ReferenceLine y={70} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
                      <Line type="monotone" dataKey="score" stroke={trendLineColor(scoreData.grade)} strokeWidth={2}
                        dot={{ r: 3, fill: trendLineColor(scoreData.grade) }} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-[10px] text-muted-foreground text-center mt-0.5">— 70 = "Good" threshold</p>
                </div>
              </div>

              {/* Tip */}
              {(() => {
                const weakest = [...scoreData.components].sort((a, b) => a.pct - b.pct)[0];
                if (!weakest || weakest.pct >= 80) return null;
                const tips: Record<string, string> = {
                  "Applications this week": "Try to submit at least 5–8 applications this week to boost your score.",
                  "Active interviews": "Keep pushing — interviews are the biggest score driver. Apply to more strong-match jobs.",
                  "Follow-ups sent": "Log follow-ups in your Networking Tracker by updating the Last Contact Date.",
                  "Networking contacts": "Add new contacts in the Networking Tracker to increase your score.",
                  "Conversion rate": "Focus on higher-match jobs and tailor your resume with ATS scoring to improve conversion.",
                  "Resume ATS score": "Use the Resume Optimizer to score your resume against target jobs.",
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

      {/* ── Bottom row: Recent Applications + Role Breakdown ─────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent Applied Jobs */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Send className="h-3.5 w-3.5 text-muted-foreground" />
                Recent Applications
              </CardTitle>
              <Link href="/jobs">
                <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  View all →
                </span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : recentApplied.length === 0 ? (
              <div className="text-center py-6">
                <Send className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No applications yet.</p>
                <Link href="/jobs"><Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs">Add from Jobs Inbox →</Button></Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentApplied.map(job => (
                  <Link key={job.id} href={`/jobs/${job.id}`}>
                    <div className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-muted/60 transition-colors cursor-pointer"
                      data-testid={`row-recent-job-${job.id}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{job.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.company}
                          {job.dateApplied && ` · ${new Date(job.dateApplied).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                        </p>
                      </div>
                      <Badge variant={(statusBadgeVariant[job.status] as any) ?? "secondary"} className="shrink-0 text-xs">
                        {job.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role & Priority Breakdown */}
        <div className="space-y-4">
          {/* Role Breakdown */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                Jobs by Role Type
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
              ) : topRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">No jobs yet.</p>
              ) : (
                <div className="space-y-2">
                  {topRoles.map(([role, count]) => {
                    const pct = totalJobs > 0 ? (count / totalJobs) * 100 : 0;
                    return (
                      <div key={role} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-1 text-xs">
                          <span className="text-muted-foreground truncate">{role}</span>
                          <span className="font-medium shrink-0">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardContent className="px-5 py-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Interviews", href: "/interviews", icon: MessageSquare, color: "text-blue-600 dark:text-blue-400" },
                  { label: "Offers", href: "/offers", icon: Trophy, color: "text-amber-600 dark:text-amber-400" },
                  { label: "Analytics", href: "/analytics", icon: BarChart3, color: "text-violet-600 dark:text-violet-400" },
                  { label: "Networking", href: "/networking", icon: Users, color: "text-emerald-600 dark:text-emerald-400" },
                ].map(item => (
                  <Link key={item.label} href={item.href}>
                    <div className="flex items-center gap-2 rounded-md px-3 py-2.5 bg-muted/40 hover:bg-muted transition-colors cursor-pointer"
                      data-testid={`link-quick-${item.label.toLowerCase()}`}>
                      <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                      <span className="text-xs font-medium">{item.label}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
