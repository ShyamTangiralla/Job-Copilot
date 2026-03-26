import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Send, MessageSquare, Trophy, TrendingUp, FileText,
  Globe, DollarSign, Clock, Timer, Award, ChevronRight, BarChart3, Minus,
} from "lucide-react";
import { Link } from "wouter";
import type { Job, ResumeVersion } from "@shared/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const APPLIED_STATUSES  = new Set(["Applied","Interview","Final Round","Offer","Rejected","No Response"]);
const INTERVIEW_STATUSES = new Set(["Interview","Final Round","Offer"]);

function parseSalary(raw: string): number | null {
  if (!raw) return null;
  const s = raw.replace(/,/g, "").toLowerCase();
  const kMatch = s.match(/\$?([\d.]+)k/g);
  if (kMatch) {
    const nums = kMatch.map(m => parseFloat(m.replace(/\$|k/gi, "")) * 1000);
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
  }
  const nums = s.match(/\d+(\.\d+)?/g);
  if (nums) {
    const vals = nums.map(Number).filter(v => v >= 10000 && v <= 10000000);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return null;
}

function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const da = new Date(a), db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  const diff = (db.getTime() - da.getTime()) / 86400000;
  return diff >= 0 && diff < 730 ? Math.round(diff) : null;
}

function fmtCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n}`;
}

// ─── Summary Metric Card ──────────────────────────────────────────────────────
interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  badge?: string;
  badgeColor?: string;
  to?: string;
  testId?: string;
  loading?: boolean;
}
function MetricCard({ label, value, sub, icon: Icon, iconBg, iconColor, badge, badgeColor, to, testId, loading }: MetricCardProps) {
  const inner = (
    <Card className={`h-full transition-shadow ${to ? "hover:shadow-md cursor-pointer" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className={`p-2.5 rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          {badge && (
            <Badge className={`text-[10px] font-semibold border-0 ${badgeColor}`}>{badge}</Badge>
          )}
          {to && !badge && <ChevronRight className="h-4 w-4 text-muted-foreground/40 mt-1" />}
        </div>
        {loading ? (
          <>
            <Skeleton className="h-8 w-20 mb-1" />
            <Skeleton className="h-3.5 w-28" />
          </>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums leading-none" data-testid={testId}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{sub}</p>}
          </>
        )}
        <p className="text-xs font-medium text-muted-foreground mt-2">{label}</p>
      </CardContent>
    </Card>
  );
  return to ? <Link href={to}>{inner}</Link> : inner;
}

// ─── Best-of Card (source / resume version) ───────────────────────────────────
interface BestCardProps {
  label: string;
  winner: { name: string; applied: number; interviews: number; offers: number; rate: number } | null;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  emptyMsg: string;
  to?: string;
  testId?: string;
  loading?: boolean;
}
function BestCard({ label, winner, icon: Icon, iconBg, iconColor, emptyMsg, to, testId, loading }: BestCardProps) {
  const inner = (
    <Card className={`h-full transition-shadow ${to ? "hover:shadow-md cursor-pointer" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className={`p-2.5 rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <Award className="h-4 w-4 text-amber-500 mt-1 shrink-0" />
        </div>
        {loading ? (
          <>
            <Skeleton className="h-6 w-36 mb-1" />
            <Skeleton className="h-3.5 w-24" />
          </>
        ) : winner ? (
          <>
            <p className="text-lg font-bold leading-tight line-clamp-2" data-testid={testId}>{winner.name}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
              <span className="text-xs text-muted-foreground">{winner.applied} applied</span>
              <span className="text-xs text-muted-foreground">{winner.interviews} interviews</span>
              {winner.offers > 0 && <span className="text-xs text-muted-foreground">{winner.offers} offers</span>}
            </div>
            <div className="mt-2">
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0 text-[10px] font-semibold">
                {winner.rate}% interview rate
              </Badge>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground pt-1">{emptyMsg}</p>
        )}
        <p className="text-xs font-medium text-muted-foreground mt-3">{label}</p>
      </CardContent>
    </Card>
  );
  return to ? <Link href={to}>{inner}</Link> : inner;
}

// ─── Timeline bar ─────────────────────────────────────────────────────────────
function TimelineBar({ days, max, color }: { days: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((days / max) * 100, 100) : 0;
  return (
    <div className="h-2 rounded-full bg-muted mt-1.5">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Pipeline mini-table ──────────────────────────────────────────────────────
function PipelineRow({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-8 text-right">{count}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function JobSearchSummary() {
  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: versions, isLoading: versionsLoading } = useQuery<ResumeVersion[]>({ queryKey: ["/api/resume-versions"] });

  const loading = jobsLoading || versionsLoading;

  // ── Core subsets ─────────────────────────────────────────────────────────────
  const allJobs     = jobs ?? [];
  const applied     = allJobs.filter(j => APPLIED_STATUSES.has(j.status));
  const interviewed = allJobs.filter(j => INTERVIEW_STATUSES.has(j.status));
  const offers      = allJobs.filter(j => j.status === "Offer");

  const totalApplied     = applied.length;
  const totalInterviewed = interviewed.length;
  const totalOffers      = offers.length;
  const conversionRate   = totalApplied > 0 ? Math.round(totalInterviewed / totalApplied * 100) : 0;

  // ── Time metrics ─────────────────────────────────────────────────────────────
  const daysToInterview = applied
    .map(j => daysBetween(j.dateApplied, j.interviewDate))
    .filter((d): d is number => d !== null);
  const avgDaysToInterview = daysToInterview.length > 0
    ? Math.round(daysToInterview.reduce((a, b) => a + b, 0) / daysToInterview.length)
    : null;

  const daysToOffer = applied
    .map(j => daysBetween(j.dateApplied, j.offerDate || null))
    .filter((d): d is number => d !== null);
  const avgDaysToOffer = daysToOffer.length > 0
    ? Math.round(daysToOffer.reduce((a, b) => a + b, 0) / daysToOffer.length)
    : null;

  const maxTimeline = Math.max(avgDaysToInterview ?? 0, avgDaysToOffer ?? 0, 1);

  // ── Average salary offered ────────────────────────────────────────────────────
  const salaries = offers
    .map(j => parseSalary(j.offerSalary))
    .filter((s): s is number => s !== null);
  const avgSalary = salaries.length > 0
    ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length)
    : null;

  // ── Best resume version ───────────────────────────────────────────────────────
  const versionMap: Record<number, { applied: number; interviews: number; offers: number }> = {};
  for (const j of applied) {
    if (!j.resumeVersionId) continue;
    if (!versionMap[j.resumeVersionId]) versionMap[j.resumeVersionId] = { applied: 0, interviews: 0, offers: 0 };
    versionMap[j.resumeVersionId].applied++;
    if (INTERVIEW_STATUSES.has(j.status)) versionMap[j.resumeVersionId].interviews++;
    if (j.status === "Offer") versionMap[j.resumeVersionId].offers++;
  }
  const bestVersionEntry = Object.entries(versionMap)
    .filter(([, v]) => v.applied >= 1)
    .map(([id, v]) => {
      const ver = (versions ?? []).find(x => x.id === Number(id));
      return { id: Number(id), name: ver?.versionLabel || `Version #${id}`, ...v, rate: Math.round(v.interviews / v.applied * 100) };
    })
    .sort((a, b) => b.rate - a.rate || b.applied - a.applied)[0] ?? null;

  // ── Best job source ───────────────────────────────────────────────────────────
  const sourceMap: Record<string, { applied: number; interviews: number; offers: number }> = {};
  for (const j of applied) {
    const s = j.source || "Unknown";
    if (!sourceMap[s]) sourceMap[s] = { applied: 0, interviews: 0, offers: 0 };
    sourceMap[s].applied++;
    if (INTERVIEW_STATUSES.has(j.status)) sourceMap[s].interviews++;
    if (j.status === "Offer") sourceMap[s].offers++;
  }
  const bestSourceEntry = Object.entries(sourceMap)
    .filter(([, v]) => v.applied >= 1)
    .map(([name, v]) => ({ name, ...v, rate: Math.round(v.interviews / v.applied * 100) }))
    .sort((a, b) => b.rate - a.rate || b.applied - a.applied)[0] ?? null;

  // ── Pipeline for bar chart ────────────────────────────────────────────────────
  const pipelineRows = [
    { label: "Discovered",  count: allJobs.length,    pct: 100,                                                             color: "bg-slate-400 dark:bg-slate-500" },
    { label: "Applied",     count: totalApplied,       pct: allJobs.length > 0  ? (totalApplied / allJobs.length) * 100 : 0, color: "bg-violet-500" },
    { label: "Interviewed", count: totalInterviewed,   pct: totalApplied > 0    ? (totalInterviewed / totalApplied) * 100 : 0, color: "bg-blue-500" },
    { label: "Offer",       count: totalOffers,        pct: totalApplied > 0    ? (totalOffers / totalApplied) * 100 : 0,    color: "bg-emerald-500" },
    { label: "Rejected",    count: applied.filter(j => j.status === "Rejected").length,
      pct: totalApplied > 0 ? (applied.filter(j => j.status === "Rejected").length / totalApplied) * 100 : 0,
      color: "bg-red-400" },
  ];

  // ── Source breakdown (top 5) ──────────────────────────────────────────────────
  const sourceRows = Object.entries(sourceMap)
    .map(([name, v]) => ({ name, ...v, rate: v.applied > 0 ? Math.round(v.interviews / v.applied * 100) : 0 }))
    .sort((a, b) => b.applied - a.applied)
    .slice(0, 5);
  const maxSourceApplied = Math.max(...sourceRows.map(s => s.applied), 1);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Job Search Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A complete picture of your job search performance.
          </p>
        </div>
        <Link href="/analytics">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <BarChart3 className="h-3.5 w-3.5" />
            Full Analytics
            <ChevronRight className="h-3 w-3" />
          </div>
        </Link>
      </div>

      {/* ── Section 1: Core KPIs (4-up) ────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Application Totals</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Total Applications"
            value={loading ? "—" : totalApplied}
            sub={loading ? "" : `out of ${allJobs.length} jobs discovered`}
            icon={Send}
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconColor="text-violet-600 dark:text-violet-400"
            to="/jobs"
            testId="text-summary-total-apps"
            loading={loading}
          />
          <MetricCard
            label="Total Interviews"
            value={loading ? "—" : totalInterviewed}
            sub={loading ? "" : totalApplied > 0 ? `${conversionRate}% of applications` : "No applications yet"}
            icon={MessageSquare}
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconColor="text-blue-600 dark:text-blue-400"
            to="/interviews"
            testId="text-summary-total-interviews"
            loading={loading}
          />
          <MetricCard
            label="Total Offers"
            value={loading ? "—" : totalOffers}
            sub={loading ? "" : totalApplied > 0 ? `${totalApplied > 0 ? Math.round(totalOffers / totalApplied * 100) : 0}% offer rate` : "Keep applying!"}
            icon={Trophy}
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconColor="text-amber-600 dark:text-amber-400"
            to="/offers"
            badge={totalOffers > 0 ? `${totalOffers} ${totalOffers === 1 ? "Offer" : "Offers"}` : undefined}
            badgeColor="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
            testId="text-summary-total-offers"
            loading={loading}
          />
          <MetricCard
            label="Conversion Rate"
            value={loading ? "—" : `${conversionRate}%`}
            sub={loading ? "" : `${totalInterviewed} interviews from ${totalApplied} applications`}
            icon={TrendingUp}
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconColor="text-emerald-600 dark:text-emerald-400"
            badge={conversionRate >= 20 ? "Strong" : conversionRate >= 10 ? "Average" : totalApplied > 0 ? "Needs Work" : undefined}
            badgeColor={conversionRate >= 20 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : conversionRate >= 10 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}
            testId="text-summary-conversion"
            loading={loading}
          />
        </div>
      </div>

      <Separator />

      {/* ── Section 2: Timing metrics + Salary ─────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Timeline & Compensation</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Avg time to interview */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-cyan-100 dark:bg-cyan-900/30">
                  <Clock className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                </div>
              </div>
              {loading ? (
                <><Skeleton className="h-8 w-20 mb-1" /><Skeleton className="h-3.5 w-32" /></>
              ) : avgDaysToInterview != null ? (
                <>
                  <p className="text-2xl font-bold tabular-nums" data-testid="text-summary-days-interview">{avgDaysToInterview}d</p>
                  <TimelineBar days={avgDaysToInterview} max={maxTimeline} color="bg-cyan-500" />
                  <p className="text-xs text-muted-foreground mt-1.5">from {daysToInterview.length} data points</p>
                </>
              ) : (
                <><p className="text-2xl font-bold text-muted-foreground">—</p><p className="text-xs text-muted-foreground mt-1.5">No interview data yet</p></>
              )}
              <p className="text-xs font-medium text-muted-foreground mt-2">Avg Time to Interview</p>
            </CardContent>
          </Card>

          {/* Avg time to offer */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
                  <Timer className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
              {loading ? (
                <><Skeleton className="h-8 w-20 mb-1" /><Skeleton className="h-3.5 w-32" /></>
              ) : avgDaysToOffer != null ? (
                <>
                  <p className="text-2xl font-bold tabular-nums" data-testid="text-summary-days-offer">{avgDaysToOffer}d</p>
                  <TimelineBar days={avgDaysToOffer} max={maxTimeline} color="bg-indigo-500" />
                  <p className="text-xs text-muted-foreground mt-1.5">from {daysToOffer.length} data points</p>
                </>
              ) : (
                <><p className="text-2xl font-bold text-muted-foreground">—</p><p className="text-xs text-muted-foreground mt-1.5">No offer date data yet</p></>
              )}
              <p className="text-xs font-medium text-muted-foreground mt-2">Avg Time to Offer</p>
            </CardContent>
          </Card>

          {/* Avg salary offered */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-green-100 dark:bg-green-900/30">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                {salaries.length > 0 && (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-0 text-[10px]">
                    {salaries.length} offer{salaries.length > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {loading ? (
                <><Skeleton className="h-8 w-20 mb-1" /><Skeleton className="h-3.5 w-32" /></>
              ) : avgSalary != null ? (
                <>
                  <p className="text-2xl font-bold tabular-nums" data-testid="text-summary-avg-salary">{fmtCurrency(avgSalary)}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {salaries.length > 1
                      ? `Range: ${fmtCurrency(Math.min(...salaries))} – ${fmtCurrency(Math.max(...salaries))}`
                      : "Based on 1 offer"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-muted-foreground">—</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {totalOffers > 0 ? "Add offer salary in Offer Tracker" : "No offers recorded yet"}
                  </p>
                </>
              )}
              <p className="text-xs font-medium text-muted-foreground mt-2">Avg Salary Offered</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* ── Section 3: Best performers ──────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top Performers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BestCard
            label="Best Resume Version"
            winner={bestVersionEntry}
            icon={FileText}
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconColor="text-violet-600 dark:text-violet-400"
            emptyMsg="Apply with a resume version to see performance."
            to="/resume-versions"
            testId="text-summary-best-resume"
            loading={loading}
          />
          <BestCard
            label="Best Job Source"
            winner={bestSourceEntry}
            icon={Globe}
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconColor="text-blue-600 dark:text-blue-400"
            emptyMsg="Apply from different sources to compare performance."
            testId="text-summary-best-source"
            loading={loading}
          />
        </div>
      </div>

      <Separator />

      {/* ── Section 4: Pipeline + Source breakdown ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pipeline */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Application Pipeline</h2>
          <Card>
            <CardContent className="p-5 space-y-2.5">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)
              ) : (
                pipelineRows.map(row => (
                  <PipelineRow key={row.label} {...row} />
                ))
              )}
              {!loading && totalApplied > 0 && (
                <div className="pt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Minus className="h-3 w-3" />
                  <span>Bars scaled relative to total discovered ({allJobs.length} jobs)</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Source breakdown */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Applications by Source</h2>
          <Card>
            <CardContent className="p-5">
              {loading ? (
                <div className="space-y-2.5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : sourceRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No source data yet.</p>
              ) : (
                <div className="space-y-3">
                  {sourceRows.map(row => (
                    <div key={row.name}>
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium truncate">{row.name}</span>
                          {row.rate > 0 && (
                            <Badge className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0 font-semibold px-1 h-4">
                              {row.rate}%
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                          <span>{row.interviews}i</span>
                          <span className="font-semibold text-foreground">{row.applied}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-violet-500 transition-all"
                          style={{ width: `${(row.applied / maxSourceApplied) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground pt-1">% = interview rate · i = interviews</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Empty state nudge */}
      {!loading && allJobs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No data yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add jobs and start applying to see your summary.</p>
            <Link href="/jobs">
              <div className="inline-flex items-center gap-1.5 text-xs text-primary mt-3 hover:underline cursor-pointer">
                Go to Jobs Inbox <ChevronRight className="h-3 w-3" />
              </div>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
