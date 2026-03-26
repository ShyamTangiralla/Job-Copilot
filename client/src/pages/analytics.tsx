import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine,
  PieChart, Pie, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, Send, MessageSquare, Trophy, Target, Clock,
  Zap, BarChart3, FileText, Star, ArrowRight, ChevronRight,
  Briefcase, Globe, Calendar, Award, Search,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AnalyticsData {
  totalJobs: number;
  totalJobsScraped: number;
  totalJobsImported: number;
  totalReviewed: number;
  totalApplications: number;
  totalInterviews: number;
  totalOffers: number;
  conversionRate: number;
  avgAtsScoreApplied: number;
  avgDaysPostedToApplied: number | null;
  avgDaysAppliedToInterview: number | null;
  avgDaysBetweenApplications: number | null;
  applicationsPerWeek: { week: string; count: number }[];
  applicationsPerDay: { date: string; count: number }[];
  interviewsPerMonth: { month: string; count: number }[];
  jobsPerDay: { date: string; count: number }[];
  applicationsByRoleType: { role: string; count: number }[];
  atsDistribution: { range: string; count: number }[];
  atsVsInterviewRate: { range: string; applied: number; interviews: number; rate: number }[];
  versionInterviewRate: { version: string; applied: number; interviews: number; rate: number }[];
  bestVersion: { version: string; applied: number; interviews: number; rate: number } | null;
  topCompanies: { company: string; count: number }[];
  topTitles: { title: string; count: number }[];
  workModeBreakdown: { mode: string; count: number }[];
  atsImprovements: { label: string; before: number; after: number; delta: number }[];
  pipelineFunnel: { stage: string; count: number; conversionFromPrev: number }[];
  jobMarketTopTitles: { title: string; count: number }[];
  jobMarketTopCompanies: { company: string; count: number }[];
  jobMarketTopSkills: { skill: string; count: number }[];
  skillsTrend: Record<string, string | number>[];
  avgMatchScoreByRole: { role: string; avgScore: number; count: number }[];
  totalVersions: number;
  avgAtsBefore: number;
  avgAtsAfter: number;
  salarySummaryByRole: { role: string; count: number; avg: number; min: number; max: number }[];
  salarySummaryByLocation: { location: string; count: number; avg: number }[];
  salarySummaryByWorkMode: { mode: string; count: number; avg: number; min: number; max: number }[];
  overallAvgSalary: number | null;
  totalJobsWithSalary: number;
  salaryDistribution: { label: string; count: number }[];
  offerVsRange: { company: string; rangeMin: number; rangeMax: number; offered: number | null }[];
  sourceAnalytics: { source: string; applied: number; interviews: number; offers: number; interviewRate: number; offerRate: number }[];
  bestSource: { source: string; applied: number; interviews: number; offers: number; interviewRate: number; offerRate: number } | null;
  versionPerformance: { version: string; applied: number; interviews: number; offers: number; interviewRate: number; offerRate: number; avgAts: number }[];
  interviewsPerWeek: { week: string; count: number }[];
  offersPerMonth: { month: string; count: number }[];
  applicationsByLocation: { location: string; count: number }[];
  avgDaysAppliedToOffer: number | null;
  weeklyTrend: { week: string; applications: number; interviews: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtWeek(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtMonth(iso: string) {
  const [y, m] = iso.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PALETTE = ["#6366f1","#8b5cf6","#0ea5e9","#06b6d4","#10b981","#f59e0b","#f43f5e","#84cc16","#ec4899","#14b8a6"];
const FUNNEL_COLORS = ["#94a3b8","#8b5cf6","#6366f1","#0ea5e9","#10b981","#f59e0b"];
const WORK_MODE_COLORS: Record<string, string> = { Remote: "#6366f1", Hybrid: "#0ea5e9", "On-site": "#10b981", Onsite: "#10b981", Unknown: "#94a3b8" };

function atsColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#f43f5e";
}

// ─── Shared UI pieces ─────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, icon: Icon, color, badge }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; badge?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs text-muted-foreground font-medium leading-tight">{label}</span>
          <Icon className={`h-4 w-4 shrink-0 ${color}`} />
        </div>
        <p className="text-2xl font-bold leading-none" data-testid={`metric-${label.toLowerCase().replace(/\s+/g,"-")}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
        {badge && <Badge variant="secondary" className="text-[10px] mt-2 px-1.5 py-0">{badge}</Badge>}
      </CardContent>
    </Card>
  );
}

function TimeCard({ label, value, sub, iconColor, bg }: {
  label: string; value: string; sub: string; iconColor: string; bg: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${bg}`}>
          <Clock className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{children}</p>;
}

function EmptyChart({ message = "No data yet" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground text-sm gap-2">
      <BarChart3 className="h-7 w-7 opacity-30" />
      <p>{message}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background shadow-md px-3 py-2 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? p.stroke }} className="text-xs">
          {p.name}: <strong>{p.value}</strong>{p.name?.toLowerCase().includes("rate") || p.name?.toLowerCase().includes("score") ? "%" : ""}
        </p>
      ))}
    </div>
  );
}

function SkeletonCards(n: number, h = "h-28") {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-${Math.min(n, 4)} gap-4`}>
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className={`${h} rounded-lg`} />)}
    </div>
  );
}

// ─── Pipeline Funnel Visual ───────────────────────────────────────────────────
function PipelineFunnelViz({ stages }: { stages: AnalyticsData["pipelineFunnel"] }) {
  const max = Math.max(...stages.map(s => s.count), 1);
  return (
    <div className="flex flex-col gap-1.5 py-1">
      {stages.map((stage, i) => {
        const widthPct = Math.max((stage.count / max) * 100, 3);
        return (
          <div key={stage.stage}>
            {i > 0 && (
              <div className="flex items-center gap-1.5 pl-3 mb-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium">
                  {stage.conversionFromPrev}% conversion
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative h-10 bg-muted/40 rounded-lg overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded-lg"
                  style={{ width: `${widthPct}%`, backgroundColor: FUNNEL_COLORS[i], opacity: 0.9 }}
                />
                <div className="absolute inset-0 flex items-center px-3">
                  <span className="text-xs font-semibold text-white drop-shadow z-10">{stage.stage}</span>
                </div>
              </div>
              <span className="text-sm font-bold tabular-nums w-16 text-right shrink-0"
                data-testid={`funnel-${stage.stage.toLowerCase().replace(/\s+/g,"-")}`}>
                {stage.count.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Skill Bar (horizontal compact) ──────────────────────────────────────────
function SkillBar({ skill, count, max }: { skill: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">{skill}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-8 text-right tabular-nums">{count}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery<AnalyticsData>({ queryKey: ["/api/analytics"] });

  if (error) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Analytics unavailable</p>
        <p className="text-sm mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <BarChart3 className="h-6 w-6 text-primary" />
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pipeline, resume performance, application trends, time metrics, and job market intelligence.
        </p>
      </div>

      {/* ── Top metric strip ────────────────────────────────────────────────── */}
      {isLoading ? SkeletonCards(6, "h-24") : data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Total Jobs" value={data.totalJobs}
            sub={`${data.totalJobsScraped} scraped · ${data.totalJobsImported} imported`}
            icon={Search} color="text-blue-500" />
          <MetricCard label="Reviewed" value={data.totalReviewed}
            sub="Moved past New status" icon={Star} color="text-violet-500" />
          <MetricCard label="Applications" value={data.totalApplications}
            sub="Applied or beyond" icon={Send} color="text-emerald-500" />
          <MetricCard label="Interviews" value={data.totalInterviews}
            sub="Interview · Final · Offer" icon={MessageSquare} color="text-cyan-500" />
          <MetricCard label="Offers" value={data.totalOffers}
            sub="At offer stage" icon={Trophy} color="text-amber-500" />
          <MetricCard label="Conversion" value={`${data.conversionRate}%`}
            sub="Applied → Interview"
            icon={TrendingUp} color="text-indigo-500"
            badge={data.conversionRate >= 20 ? "Strong" : data.conversionRate >= 10 ? "Good" : "Needs work"} />
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1 h-auto p-1">
          <TabsTrigger value="performance" data-testid="tab-performance" className="text-xs">Performance</TabsTrigger>
          <TabsTrigger value="pipeline" data-testid="tab-pipeline" className="text-xs">Pipeline</TabsTrigger>
          <TabsTrigger value="resume" data-testid="tab-resume" className="text-xs">Resume</TabsTrigger>
          <TabsTrigger value="sources" data-testid="tab-sources" className="text-xs">Sources</TabsTrigger>
          <TabsTrigger value="salary" data-testid="tab-salary" className="text-xs">Salary</TabsTrigger>
          <TabsTrigger value="time" data-testid="tab-time" className="text-xs">Time</TabsTrigger>
          <TabsTrigger value="market" data-testid="tab-market" className="text-xs">Job Market</TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 1 — PIPELINE FUNNEL
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="pipeline" className="space-y-4">
          {isLoading ? SkeletonCards(2, "h-72") : data && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                {/* Visual funnel */}
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Conversion Funnel</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Scraped → Imported → Reviewed → Applied → Interview → Offer
                    </p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <PipelineFunnelViz stages={data.pipelineFunnel} />
                  </CardContent>
                </Card>

                {/* Conversion % bar chart */}
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Stage Conversion Rates</CardTitle>
                    <p className="text-xs text-muted-foreground">% progressing from each stage to the next</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={data.pipelineFunnel.slice(1)} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="conversionFromPrev" name="Conversion rate" radius={[3, 3, 0, 0]} barSize={36}>
                          {data.pipelineFunnel.slice(1).map((s, i) => (
                            <Cell key={i} fill={FUNNEL_COLORS[i + 1]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Stage count cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {data.pipelineFunnel.map((s, i) => (
                  <Card key={s.stage}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: FUNNEL_COLORS[i] }} />
                        <span className="text-[10px] text-muted-foreground font-medium">{s.stage}</span>
                      </div>
                      <p className="text-xl font-bold">{s.count.toLocaleString()}</p>
                      {i > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {s.conversionFromPrev}% from prev
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            TAB — JOB SEARCH PERFORMANCE DASHBOARD
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="performance" className="space-y-4">
          {isLoading ? SkeletonCards(3, "h-48") : data && (
            <>
              {/* Time metric KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Avg Response Time", value: data.avgDaysAppliedToInterview != null ? `${data.avgDaysAppliedToInterview}d` : "—", sub: "Applied → Interview", icon: Clock },
                  { label: "Avg Time to Interview", value: data.avgDaysPostedToApplied != null ? `${data.avgDaysPostedToApplied}d` : "—", sub: "Posted → Applied", icon: Calendar },
                  { label: "Avg Time to Offer", value: data.avgDaysAppliedToOffer != null ? `${data.avgDaysAppliedToOffer}d` : "—", sub: "Applied → Offer", icon: Trophy },
                  { label: "Overall Conversion", value: `${data.conversionRate}%`, sub: "Applied → Interview", icon: TrendingUp },
                ].map(c => (
                  <Card key={c.label}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs text-muted-foreground font-medium leading-tight">{c.label}</span>
                        <c.icon className="h-4 w-4 text-primary/60 shrink-0" />
                      </div>
                      <p className="text-2xl font-bold">{c.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Weekly trend: applications + interviews combined */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Weekly Activity — Applications vs Interviews</CardTitle>
                  <p className="text-xs text-muted-foreground">Last 16 weeks</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={data.weeklyTrend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="appGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="intGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 10 }} interval={2} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Area type="monotone" dataKey="applications" name="Applications" stroke="#6366f1" fill="url(#appGrad)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="interviews" name="Interviews" stroke="#10b981" fill="url(#intGrad)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Row: Applications by Role + By Location */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Applications by Role</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    {data.applicationsByRoleType.length === 0
                      ? <EmptyChart message="No applications yet" />
                      : (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={data.applicationsByRoleType} layout="vertical" margin={{ top: 4, right: 16, left: 80, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                            <YAxis type="category" dataKey="role" tick={{ fontSize: 10 }} width={78} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="count" name="Applications" radius={[0, 3, 3, 0]}>
                              {data.applicationsByRoleType.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Applications by Location</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {data.applicationsByLocation.length === 0
                      ? <EmptyChart message="No location data yet" />
                      : (
                        <div className="space-y-2 mt-1">
                          {data.applicationsByLocation.map((loc, i) => {
                            const max = data.applicationsByLocation[0].count;
                            return (
                              <div key={loc.location} className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
                                <span className="text-xs font-medium w-28 truncate">{loc.location}</span>
                                <div className="flex-1 bg-muted rounded-full h-1.5">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((loc.count / max) * 100)}%` }} />
                                </div>
                                <span className="text-xs font-semibold w-6 text-right">{loc.count}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </CardContent>
                </Card>
              </div>

              {/* Offers per month */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Offers per Month</CardTitle>
                  <p className="text-xs text-muted-foreground">Last 12 months</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={data.offersPerMonth} margin={{ top: 4, right: 16, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10 }} interval={1} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Offers" fill="hsl(142, 71%, 45%)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>


        {/* ════════════════════════════════════════════════════════════════════
            TAB 3 — RESUME PERFORMANCE
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="resume" className="space-y-4">
          {isLoading ? SkeletonCards(4, "h-24") : data && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Resume Versions" value={data.totalVersions}
                  sub="Saved versions" icon={FileText} color="text-indigo-500" />
                <MetricCard label="Avg ATS at Apply"
                  value={data.avgAtsScoreApplied > 0 ? `${data.avgAtsScoreApplied}%` : "—"}
                  sub="Across all applied jobs" icon={Target}
                  color={data.avgAtsScoreApplied >= 70 ? "text-green-500" : "text-amber-500"} />
                <MetricCard label="Avg ATS Before"
                  value={data.avgAtsBefore > 0 ? `${data.avgAtsBefore}%` : "—"}
                  sub="Pre-optimization" icon={Zap} color="text-rose-500" />
                <MetricCard label="Avg ATS After"
                  value={data.avgAtsAfter > 0 ? `${data.avgAtsAfter}%` : "—"}
                  sub="Post-optimization" icon={Zap} color="text-emerald-500"
                  badge={data.avgAtsAfter > data.avgAtsBefore ? `+${data.avgAtsAfter - data.avgAtsBefore}pt gain` : undefined} />
              </div>

              {/* Best version highlight */}
              {data.bestVersion && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                      <Award className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">Best Performing Resume Version</p>
                      <p className="font-semibold text-sm truncate">{data.bestVersion.version}</p>
                      <p className="text-xs text-muted-foreground">
                        {data.bestVersion.applied} applications · {data.bestVersion.interviews} interviews
                      </p>
                    </div>
                    <Badge className="text-sm font-bold px-3 py-1">{data.bestVersion.rate}% interview rate</Badge>
                  </CardContent>
                </Card>
              )}

              {/* ATS distribution + ATS vs interview rate */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">ATS Score Distribution</CardTitle>
                    <p className="text-xs text-muted-foreground">Applied jobs with ATS data</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    {data.atsDistribution.every(d => d.count === 0)
                      ? <EmptyChart message="No ATS score data yet" />
                      : (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={data.atsDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="count" name="Jobs" radius={[3, 3, 0, 0]}>
                              {data.atsDistribution.map((d, i) => {
                                const mid = parseInt(d.range.split("–")[0]) + 10;
                                return <Cell key={i} fill={atsColor(mid)} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">ATS Score vs Interview Rate</CardTitle>
                    <p className="text-xs text-muted-foreground">Does a higher ATS score predict interviews?</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    {data.atsVsInterviewRate.every(d => d.applied === 0)
                      ? <EmptyChart message="No ATS + interview data yet" />
                      : (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={data.atsVsInterviewRate} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="rate" name="Interview rate" radius={[3, 3, 0, 0]}>
                              {data.atsVsInterviewRate.map((d, i) => {
                                const mid = parseInt(d.range.split("–")[0]) + 10;
                                return <Cell key={i} fill={atsColor(mid)} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                  </CardContent>
                </Card>
              </div>

              {/* Version interview rate */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Resume Version vs Interview Rate</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Interview rate per version — green = above average, amber = below
                  </p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {data.versionInterviewRate.length === 0
                    ? <EmptyChart message="Link resume versions to applied jobs to see this chart" />
                    : (
                      <ResponsiveContainer width="100%" height={Math.max(200, data.versionInterviewRate.length * 38)}>
                        <BarChart data={data.versionInterviewRate} layout="vertical" margin={{ top: 4, right: 64, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                          <YAxis type="category" dataKey="version" tick={{ fontSize: 9 }} width={120} />
                          <Tooltip content={<ChartTooltip />} />
                          <ReferenceLine x={data.conversionRate} stroke="#6366f1" strokeDasharray="4 2"
                            label={{ value: `Avg ${data.conversionRate}%`, position: "right", fontSize: 9, fill: "#6366f1" }} />
                          <Bar dataKey="rate" name="Interview rate" radius={[0, 3, 3, 0]} barSize={14}>
                            {data.versionInterviewRate.map((d, i) => (
                              <Cell key={i} fill={d.rate >= data.conversionRate ? "#10b981" : "#f59e0b"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>

              {/* Version performance detail table */}
              {data.versionPerformance.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Resume Version Performance Detail</CardTitle>
                    <p className="text-xs text-muted-foreground">Applications, interviews, and offers per version</p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/50">
                            <th className="text-left py-2 text-muted-foreground font-medium">Version</th>
                            <th className="text-right py-2 text-muted-foreground font-medium">Applied</th>
                            <th className="text-right py-2 text-muted-foreground font-medium">Interviews</th>
                            <th className="text-right py-2 text-muted-foreground font-medium">Offers</th>
                            <th className="text-right py-2 text-muted-foreground font-medium">Int. Rate</th>
                            <th className="text-right py-2 text-muted-foreground font-medium">Offer Rate</th>
                            <th className="text-right py-2 text-muted-foreground font-medium">Avg ATS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.versionPerformance.map((v, i) => (
                            <tr key={i} className="border-b border-border/30 hover:bg-muted/30" data-testid={`row-version-${i}`}>
                              <td className="py-2 font-medium max-w-[200px] truncate">{v.version}</td>
                              <td className="text-right py-2">{v.applied}</td>
                              <td className="text-right py-2">{v.interviews}</td>
                              <td className="text-right py-2">{v.offers}</td>
                              <td className="text-right py-2">
                                <span className={`font-medium ${v.interviewRate >= data.conversionRate ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}>
                                  {v.interviewRate}%
                                </span>
                              </td>
                              <td className="text-right py-2">
                                <span className={`font-medium ${v.offerRate > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                                  {v.offerRate}%
                                </span>
                              </td>
                              <td className="text-right py-2">{v.avgAts > 0 ? `${v.avgAts}%` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ATS before/after improvement */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">ATS Improvement per Version</CardTitle>
                  <p className="text-xs text-muted-foreground">Before vs after AI optimization</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {data.atsImprovements.length === 0
                    ? <EmptyChart message="No optimization data yet" />
                    : (
                      <ResponsiveContainer width="100%" height={Math.max(160, data.atsImprovements.length * 28)}>
                        <BarChart data={data.atsImprovements} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="label" tick={{ fontSize: 9 }} width={28} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="before" name="Before" fill="#f43f5e" radius={[0, 2, 2, 0]} barSize={8} />
                          <Bar dataKey="after" name="After" fill="#10b981" radius={[0, 2, 2, 0]} barSize={8} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            TAB — SOURCE ANALYTICS
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="sources" className="space-y-4">
          {isLoading ? SkeletonCards(3, "h-48") : data && (
            <>
              {/* Best source highlight */}
              {data.bestSource && (
                <Card className="border-emerald-400/40 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
                      <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">Best Performing Source</p>
                      <p className="font-semibold text-sm">{data.bestSource.source}</p>
                      <p className="text-xs text-muted-foreground">
                        {data.bestSource.applied} applications · {data.bestSource.interviews} interviews · {data.bestSource.offers} offers
                      </p>
                    </div>
                    <Badge className="text-sm font-bold px-3 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border-0">
                      {data.bestSource.interviewRate}% interview rate
                    </Badge>
                  </CardContent>
                </Card>
              )}

              {/* Applications by source bar chart */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Applications by Source</CardTitle>
                  <p className="text-xs text-muted-foreground">Where your applications are coming from</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {data.sourceAnalytics.length === 0
                    ? <EmptyChart message="No application source data yet" />
                    : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data.sourceAnalytics} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="source" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="applied" name="Applied" fill="#6366f1" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="interviews" name="Interviews" fill="#10b981" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="offers" name="Offers" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>

              {/* Conversion rate by source */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Interview Rate by Source</CardTitle>
                  <p className="text-xs text-muted-foreground">% of applications that led to an interview</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {data.sourceAnalytics.length === 0
                    ? <EmptyChart message="No source data yet" />
                    : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={[...data.sourceAnalytics].sort((a, b) => b.interviewRate - a.interviewRate)}
                          margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="source" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                          <Tooltip content={<ChartTooltip />} formatter={(v: any) => [`${v}%`, "Interview rate"]} />
                          <Bar dataKey="interviewRate" name="Interview rate %" radius={[3, 3, 0, 0]}>
                            {[...data.sourceAnalytics].sort((a, b) => b.interviewRate - a.interviewRate).map((_, i) => (
                              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>

              {/* Source performance table */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Source Performance Summary</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {data.sourceAnalytics.length === 0
                    ? <EmptyChart message="No source data yet" />
                    : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border/50">
                              <th className="text-left py-2 text-muted-foreground font-medium">Source</th>
                              <th className="text-right py-2 text-muted-foreground font-medium">Applied</th>
                              <th className="text-right py-2 text-muted-foreground font-medium">Interviews</th>
                              <th className="text-right py-2 text-muted-foreground font-medium">Offers</th>
                              <th className="text-right py-2 text-muted-foreground font-medium">Int. Rate</th>
                              <th className="text-right py-2 text-muted-foreground font-medium">Offer Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.sourceAnalytics.map((s, i) => (
                              <tr key={s.source} className="border-b border-border/30 hover:bg-muted/30" data-testid={`row-source-${i}`}>
                                <td className="py-2 font-medium">{s.source}</td>
                                <td className="text-right py-2">{s.applied}</td>
                                <td className="text-right py-2">{s.interviews}</td>
                                <td className="text-right py-2">{s.offers}</td>
                                <td className="text-right py-2">
                                  <span className={`font-medium ${s.interviewRate >= 20 ? "text-emerald-600 dark:text-emerald-400" : s.interviewRate >= 10 ? "text-amber-600" : "text-muted-foreground"}`}>
                                    {s.interviewRate}%
                                  </span>
                                </td>
                                <td className="text-right py-2">
                                  <span className={`font-medium ${s.offerRate >= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                                    {s.offerRate}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 4 — TIME ANALYTICS
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="time" className="space-y-4">
          {isLoading ? SkeletonCards(3, "h-24") : data && (
            <>
              {/* Time metric cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TimeCard
                  label="Avg Days: Posted → Applied"
                  value={data.avgDaysPostedToApplied != null ? `${data.avgDaysPostedToApplied}d` : "—"}
                  sub={data.avgDaysPostedToApplied != null
                    ? data.avgDaysPostedToApplied <= 3 ? "Fast mover — great signal"
                      : data.avgDaysPostedToApplied <= 7 ? "Within the first week"
                      : "Consider applying earlier"
                    : "Need date data to compute"}
                  iconColor="text-amber-600" bg="bg-amber-100 dark:bg-amber-950/50"
                />
                <TimeCard
                  label="Avg Days: Applied → Interview"
                  value={data.avgDaysAppliedToInterview != null ? `${data.avgDaysAppliedToInterview}d` : "—"}
                  sub={data.avgDaysAppliedToInterview != null
                    ? data.avgDaysAppliedToInterview <= 7 ? "Quick turnaround"
                      : data.avgDaysAppliedToInterview <= 14 ? "Typical pipeline"
                      : "Longer hiring process"
                    : "No interview data yet"}
                  iconColor="text-cyan-600" bg="bg-cyan-100 dark:bg-cyan-950/50"
                />
                <TimeCard
                  label="Avg Days Between Applications"
                  value={data.avgDaysBetweenApplications != null ? `${data.avgDaysBetweenApplications}d` : "—"}
                  sub={data.avgDaysBetweenApplications != null
                    ? data.avgDaysBetweenApplications <= 1 ? "High velocity — keep it up"
                      : data.avgDaysBetweenApplications <= 3 ? "Good cadence"
                      : data.avgDaysBetweenApplications <= 7 ? "Moderate pace"
                      : "Try applying more often"
                    : "Need 2+ dated applications"}
                  iconColor="text-violet-600" bg="bg-violet-100 dark:bg-violet-950/50"
                />
              </div>

              {/* Applications per day trend */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Applications per Day</CardTitle>
                  <p className="text-xs text-muted-foreground">Your application activity over the last 30 days</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={data.applicationsPerDay} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="appDayGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 10 }} interval={4} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} labelFormatter={fmtDay} />
                      <Area type="monotone" dataKey="count" name="Applications"
                        stroke="#10b981" strokeWidth={2} fill="url(#appDayGrad)" dot={false}
                        activeDot={{ r: 4, fill: "#10b981" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Jobs added per day */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Jobs Added per Day</CardTitle>
                  <p className="text-xs text-muted-foreground">Scraping and import activity over the last 30 days</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={data.jobsPerDay} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 10 }} interval={4} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} labelFormatter={fmtDay} />
                      <Line type="monotone" dataKey="count" name="Jobs added"
                        stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#0ea5e9" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 5 — JOB MARKET INTELLIGENCE
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="market" className="space-y-4">
          {isLoading ? SkeletonCards(2, "h-64") : data && (
            <>
              {/* Row 1: Top skills in all jobs */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Most In-Demand Skills</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Skill frequency across {data.totalJobs.toLocaleString()} job descriptions in your inbox
                  </p>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {data.jobMarketTopSkills.length === 0
                    ? <EmptyChart message="No job descriptions to analyze yet" />
                    : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 mt-1">
                        {data.jobMarketTopSkills.map((s, i) => (
                          <SkillBar
                            key={s.skill}
                            skill={s.skill}
                            count={s.count}
                            max={data.jobMarketTopSkills[0].count}
                          />
                        ))}
                      </div>
                    )}
                </CardContent>
              </Card>

              {/* Skills Trend Over Time */}
              {data.skillsTrend && data.skillsTrend.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Skills Trend Over Time</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      How often key skills appear in jobs added each month (last 6 months)
                    </p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={data.skillsTrend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                        <Tooltip content={<ChartTooltip />} />
                        {["SQL", "Python", "Excel", "Power BI", "Tableau", "R", "Machine Learning", "AWS", "Databricks", "Snowflake"].map((skill, i) => (
                          <Line
                            key={skill}
                            type="monotone"
                            dataKey={skill}
                            stroke={PALETTE[i % PALETTE.length]}
                            strokeWidth={2}
                            dot={false}
                            name={skill}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 mt-2 px-2">
                      {["SQL", "Python", "Excel", "Power BI", "Tableau", "R", "Machine Learning", "AWS", "Databricks", "Snowflake"].map((skill, i) => (
                        <span key={skill} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                          {skill}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Row 2: top titles + companies from ALL jobs */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Most Common Job Titles</CardTitle>
                    <p className="text-xs text-muted-foreground">Across all jobs in your inbox</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    {data.jobMarketTopTitles.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(200, data.jobMarketTopTitles.length * 30)}>
                        <BarChart data={data.jobMarketTopTitles} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="title" tick={{ fontSize: 9 }} width={130} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Jobs" radius={[0, 3, 3, 0]} barSize={11}>
                            {data.jobMarketTopTitles.map((_, i) => (
                              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Companies Hiring Most</CardTitle>
                    <p className="text-xs text-muted-foreground">By number of open roles in your inbox</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    {data.jobMarketTopCompanies.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(200, data.jobMarketTopCompanies.length * 30)}>
                        <BarChart data={data.jobMarketTopCompanies} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="company" tick={{ fontSize: 10 }} width={110} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Open roles" radius={[0, 3, 3, 0]} barSize={11}>
                            {data.jobMarketTopCompanies.map((_, i) => (
                              <Cell key={i} fill={PALETTE[(i + 2) % PALETTE.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Avg match score per role */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Average Match Score per Role Type</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    How well your profile matches each role category (based on AI priority scores)
                  </p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {data.avgMatchScoreByRole.length === 0
                    ? <EmptyChart message="No match score data yet — run job discovery to generate scores" />
                    : (
                      <ResponsiveContainer width="100%" height={Math.max(200, data.avgMatchScoreByRole.length * 34)}>
                        <BarChart data={data.avgMatchScoreByRole} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}`} />
                          <YAxis type="category" dataKey="role" tick={{ fontSize: 10 }} width={130} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="avgScore" name="Avg match score" radius={[0, 3, 3, 0]} barSize={14}>
                            {data.avgMatchScoreByRole.map((d, i) => (
                              <Cell key={i} fill={d.avgScore >= 70 ? "#10b981" : d.avgScore >= 50 ? "#f59e0b" : "#f43f5e"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            TAB 6 — SALARY ANALYTICS
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="salary" className="space-y-4">
          {isLoading ? SkeletonCards(3, "h-56") : data && (
            <>
              {/* Summary strip */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  {
                    label: "Avg Market Salary",
                    value: data.overallAvgSalary ? `$${Math.round(data.overallAvgSalary / 1000)}k` : "—",
                    icon: TrendingUp, color: "text-emerald-500",
                  },
                  {
                    label: "Jobs with Salary Data",
                    value: data.totalJobsWithSalary.toString(),
                    icon: Briefcase, color: "text-blue-500",
                  },
                  {
                    label: "Salary Ranges Analyzed",
                    value: data.salarySummaryByRole.length.toString(),
                    icon: BarChart3, color: "text-violet-500",
                  },
                ].map(card => (
                  <Card key={card.label}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
                        <card.icon className={`h-4 w-4 shrink-0 ${card.color}`} />
                      </div>
                      <p className="text-2xl font-bold" data-testid={`text-salary-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
                        {card.value}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Avg Salary by Role */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Average Salary by Role</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Based on salary data extracted from job descriptions in your inbox
                  </p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {data.salarySummaryByRole.length === 0 ? (
                    <EmptyChart message="No salary data found in your job descriptions yet" />
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.salarySummaryByRole} layout="vertical"
                        margin={{ top: 4, right: 40, left: 80, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }}
                          tickFormatter={v => `$${Math.round(v / 1000)}k`} />
                        <YAxis type="category" dataKey="role" tick={{ fontSize: 10 }} width={78} />
                        <Tooltip
                          content={<ChartTooltip />}
                          formatter={(v: any) => [`$${Math.round(Number(v) / 1000)}k`, "Avg"]}
                        />
                        <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]}>
                          {data.salarySummaryByRole.map((_, i) => (
                            <Cell key={i} fill={`hsl(${220 + i * 20}, 70%, ${55 - i * 3}%)`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Salary by Work Mode */}
              {data.salarySummaryByWorkMode.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Salary by Work Mode</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      How remote, hybrid, and on-site roles compare on salary
                    </p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={data.salarySummaryByWorkMode}
                        margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="mode" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${Math.round(v / 1000)}k`} />
                        <Tooltip
                          content={<ChartTooltip />}
                          formatter={(v: any) => [`$${Math.round(Number(v) / 1000)}k`, ""]}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="avg" name="Avg Salary" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="min" name="Min Salary" fill="hsl(142, 71%, 45%)" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="max" name="Max Salary" fill="hsl(24, 90%, 60%)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Top paying locations */}
              {data.salarySummaryByLocation.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Top Paying Locations</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Cities ranked by average salary in your job inbox (min. 2 jobs)
                    </p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-2 mt-1">
                      {data.salarySummaryByLocation.map((loc, i) => {
                        const maxAvg = data.salarySummaryByLocation[0].avg;
                        const pct = Math.round((loc.avg / maxAvg) * 100);
                        return (
                          <div key={loc.location} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                            <span className="text-xs font-medium w-32 truncate">{loc.location}</span>
                            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold w-14 text-right">
                              ${Math.round(loc.avg / 1000)}k
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ({loc.count} jobs)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Salary distribution histogram */}
              {data.salaryDistribution.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Salary Distribution</CardTitle>
                    <p className="text-xs text-muted-foreground">How salary ranges cluster across your applications</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data.salaryDistribution} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="count" name="Jobs" radius={[3, 3, 0, 0]}>
                          {data.salaryDistribution.map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Offer vs Range: did your offers beat the market? */}
              {data.offerVsRange.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Offer Amount vs Job Salary Range</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      How your received offer compares to the posted salary range (top = market max)
                    </p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={Math.max(200, data.offerVsRange.length * 36)}>
                      <BarChart data={data.offerVsRange} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${Math.round(v / 1000)}k`} />
                        <YAxis type="category" dataKey="company" tick={{ fontSize: 9 }} width={90} />
                        <Tooltip content={<ChartTooltip />} formatter={(v: any) => [`$${Math.round(Number(v) / 1000)}k`]} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="rangeMin" name="Posted Min" fill="#94a3b8" radius={[0, 0, 0, 0]} barSize={10} />
                        <Bar dataKey="rangeMax" name="Posted Max" fill="#cbd5e1" radius={[0, 0, 0, 0]} barSize={10} />
                        <Bar dataKey="offered" name="Offer Amount" fill="#10b981" radius={[0, 3, 3, 0]} barSize={10} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}
