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
      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pipeline" data-testid="tab-pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="applications" data-testid="tab-applications">Applications</TabsTrigger>
          <TabsTrigger value="resume" data-testid="tab-resume">Resume</TabsTrigger>
          <TabsTrigger value="time" data-testid="tab-time">Time</TabsTrigger>
          <TabsTrigger value="market" data-testid="tab-market">Job Market</TabsTrigger>
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
            TAB 2 — APPLICATION ANALYTICS
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="applications" className="space-y-4">
          {isLoading ? SkeletonCards(2, "h-64") : data && (
            <>
              {/* Row 1: apps/week + interviews/month */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Applications per Week</CardTitle>
                    <p className="text-xs text-muted-foreground">Last 16 weeks</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={data.applicationsPerWeek} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="appWeekGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 10 }} interval={2} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="count" name="Applications"
                          stroke="#6366f1" strokeWidth={2} fill="url(#appWeekGrad)" dot={false}
                          activeDot={{ r: 4, fill: "#6366f1" }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Interviews per Month</CardTitle>
                    <p className="text-xs text-muted-foreground">Last 12 months</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data.interviewsPerMonth} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10 }} interval={1} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                        <Tooltip content={<ChartTooltip />} labelFormatter={fmtMonth} />
                        <Bar dataKey="count" name="Interviews" fill="#06b6d4" radius={[3, 3, 0, 0]} barSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Row 2: by role type + work mode */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Applications by Role Type</CardTitle>
                    <p className="text-xs text-muted-foreground">How your applications break down by role</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    {data.applicationsByRoleType.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(200, data.applicationsByRoleType.length * 32)}>
                        <BarChart data={data.applicationsByRoleType} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="role" tick={{ fontSize: 10 }} width={120} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Applications" radius={[0, 3, 3, 0]} barSize={14}>
                            {data.applicationsByRoleType.map((_, i) => (
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
                    <CardTitle className="text-sm font-medium">Remote vs Hybrid vs On-site</CardTitle>
                    <p className="text-xs text-muted-foreground">Work mode breakdown for applied jobs</p>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {data.workModeBreakdown.length === 0 ? <EmptyChart /> : (
                      <div className="flex items-center gap-4">
                        <ResponsiveContainer width="55%" height={200}>
                          <PieChart>
                            <Pie data={data.workModeBreakdown} dataKey="count" nameKey="mode"
                              cx="50%" cy="50%" outerRadius={80} innerRadius={44} paddingAngle={2}>
                              {data.workModeBreakdown.map((d, i) => (
                                <Cell key={i} fill={WORK_MODE_COLORS[d.mode] ?? PALETTE[i % PALETTE.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: number) => [`${v} jobs`, ""]} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-col gap-2.5 flex-1">
                          {data.workModeBreakdown.map((d, i) => (
                            <div key={d.mode} className="flex items-center gap-2">
                              <div className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: WORK_MODE_COLORS[d.mode] ?? PALETTE[i % PALETTE.length] }} />
                              <span className="text-xs text-muted-foreground flex-1">{d.mode}</span>
                              <span className="text-xs font-semibold">{d.count}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {data.totalApplications > 0 ? `${Math.round((d.count / data.totalApplications) * 100)}%` : "0%"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Row 3: top companies + top titles (applied) */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-medium">Applications by Company</CardTitle>
                    <p className="text-xs text-muted-foreground">Companies you've applied to most</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    {data.topCompanies.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(200, data.topCompanies.length * 32)}>
                        <BarChart data={data.topCompanies} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="company" tick={{ fontSize: 10 }} width={110} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Applications" radius={[0, 3, 3, 0]} barSize={12}>
                            {data.topCompanies.map((_, i) => (
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
                    <CardTitle className="text-sm font-medium">Applications by Job Title</CardTitle>
                    <p className="text-xs text-muted-foreground">Job titles you've applied to most</p>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    {data.topTitles.length === 0 ? <EmptyChart /> : (
                      <ResponsiveContainer width="100%" height={Math.max(200, data.topTitles.length * 32)}>
                        <BarChart data={data.topTitles} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="title" tick={{ fontSize: 10 }} width={130} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Applications" radius={[0, 3, 3, 0]} barSize={12}>
                            {data.topTitles.map((_, i) => (
                              <Cell key={i} fill={PALETTE[(i + 4) % PALETTE.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
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

      </Tabs>
    </div>
  );
}
