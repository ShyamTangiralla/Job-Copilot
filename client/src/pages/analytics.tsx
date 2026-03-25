import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine, PieChart, Pie,
} from "recharts";
import {
  TrendingUp, Send, MessageSquare, Trophy, Target, Clock,
  Zap, BarChart3, FileText, Search, ArrowRight, Star, Briefcase,
  ChevronRight, MapPin, Calendar,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AnalyticsData {
  totalJobs: number;
  totalJobsScraped: number;
  totalJobsImported: number;
  totalApplications: number;
  totalInterviews: number;
  totalOffers: number;
  conversionRate: number;
  avgAtsScoreApplied: number;
  avgDaysPostedToApplied: number | null;
  avgDaysAppliedToInterview: number | null;
  avgDaysBetweenApplications: number | null;
  applicationsPerWeek: { week: string; count: number }[];
  interviewsPerMonth: { month: string; count: number }[];
  jobsPerDay: { date: string; count: number }[];
  atsDistribution: { range: string; count: number }[];
  atsVsInterviewRate: { range: string; applied: number; interviews: number; rate: number }[];
  versionInterviewRate: { version: string; applied: number; interviews: number; rate: number }[];
  topCompanies: { company: string; count: number }[];
  topTitles: { title: string; count: number }[];
  workModeBreakdown: { mode: string; count: number }[];
  atsImprovements: { label: string; before: number; after: number; delta: number }[];
  statusFunnel: { status: string; count: number }[];
  pipelineFunnel: { stage: string; count: number; conversionFromPrev: number }[];
  totalVersions: number;
  avgAtsBefore: number;
  avgAtsAfter: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtWeek(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtMonth(iso: string) {
  const [year, month] = iso.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PALETTE = [
  "#6366f1", "#8b5cf6", "#0ea5e9", "#06b6d4",
  "#10b981", "#f59e0b", "#f43f5e", "#84cc16",
];

const WORK_MODE_COLORS: Record<string, string> = {
  Remote: "#6366f1",
  Hybrid: "#0ea5e9",
  "On-site": "#10b981",
  Onsite: "#10b981",
  Unknown: "#94a3b8",
};

const FUNNEL_COLORS = ["#94a3b8", "#8b5cf6", "#6366f1", "#10b981", "#06b6d4", "#f59e0b"];

function atsColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#f43f5e";
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, icon: Icon, color, badge,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
  badge?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs text-muted-foreground font-medium leading-tight">{label}</span>
          <Icon className={`h-4 w-4 shrink-0 ${color}`} />
        </div>
        <p className="text-2xl font-bold leading-none" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
        {badge && (
          <Badge variant="secondary" className="text-[10px] mt-2 px-1.5 py-0">{badge}</Badge>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-base font-semibold">{label}</h2>
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background shadow-md px-3 py-2 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name}: <strong>{p.value}</strong>
          {p.name?.toLowerCase().includes("rate") ? "%" : ""}
        </p>
      ))}
    </div>
  );
}

// ─── Skeleton grid ────────────────────────────────────────────────────────────
function SkeletonGrid({ cols, h = "h-32" }: { cols: number; h?: string }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-${cols} gap-4`}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={`${h} w-full rounded-lg`} />
      ))}
    </div>
  );
}

// ─── Pipeline Funnel Visualization ───────────────────────────────────────────
function PipelineFunnelChart({ stages }: { stages: AnalyticsData["pipelineFunnel"] }) {
  const max = Math.max(...stages.map(s => s.count), 1);
  return (
    <div className="flex flex-col gap-2 py-2">
      {stages.map((stage, i) => {
        const widthPct = Math.max((stage.count / max) * 100, 4);
        return (
          <div key={stage.stage} className="flex flex-col gap-0.5">
            {/* Conversion arrow from previous */}
            {i > 0 && (
              <div className="flex items-center gap-2 pl-4 mb-0.5">
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] text-muted-foreground">
                  {stage.conversionFromPrev}% conversion
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              {/* Stage bar */}
              <div className="flex-1 relative h-9 bg-muted/40 rounded-md overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full rounded-md transition-all"
                  style={{ width: `${widthPct}%`, backgroundColor: FUNNEL_COLORS[i] }}
                />
                <div className="absolute inset-0 flex items-center px-3 gap-2">
                  <span className="text-xs font-semibold text-white drop-shadow-sm z-10 whitespace-nowrap">
                    {stage.stage}
                  </span>
                </div>
              </div>
              {/* Count badge */}
              <span
                className="text-sm font-bold tabular-nums w-16 text-right shrink-0"
                data-testid={`funnel-${stage.stage.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {stage.count.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
  });

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
    <div className="p-6 max-w-7xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <BarChart3 className="h-6 w-6 text-primary" />
          Analytics Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Full picture of your job search — pipeline, applications, ATS scores, conversions, and resume performance.
        </p>
      </div>

      {/* ── Section 1: Key Metrics ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Send} label="Key Metrics" />
        {isLoading ? (
          <SkeletonGrid cols={4} h="h-24" />
        ) : data && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              label="Total Jobs" value={data.totalJobs}
              sub={`${data.totalJobsScraped} scraped · ${data.totalJobsImported} imported`}
              icon={Search} color="text-blue-500"
            />
            <MetricCard
              label="Applications" value={data.totalApplications}
              sub="Jobs marked Applied+"
              icon={Send} color="text-emerald-500"
            />
            <MetricCard
              label="Interviews" value={data.totalInterviews}
              sub="Interview · Final · Offer"
              icon={MessageSquare} color="text-cyan-500"
            />
            <MetricCard
              label="Offers" value={data.totalOffers}
              sub="Jobs at Offer stage"
              icon={Trophy} color="text-amber-500"
            />
            <MetricCard
              label="Conversion Rate" value={`${data.conversionRate}%`}
              sub="Applied → Interview"
              icon={TrendingUp} color="text-violet-500"
              badge={data.conversionRate >= 20 ? "Strong" : data.conversionRate >= 10 ? "Good" : "Needs work"}
            />
            <MetricCard
              label="Avg ATS at Apply" value={data.avgAtsScoreApplied > 0 ? `${data.avgAtsScoreApplied}%` : "—"}
              sub="Across applied jobs"
              icon={Target} color={data.avgAtsScoreApplied >= 70 ? "text-green-500" : "text-amber-500"}
            />
          </div>
        )}
      </div>

      {/* ── Section 2: Pipeline Funnel ────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={ArrowRight} label="Pipeline Funnel" />
        {isLoading ? (
          <SkeletonGrid cols={2} h="h-56" />
        ) : data && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Visual funnel */}
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium">Stage Funnel</CardTitle>
                <p className="text-xs text-muted-foreground">From discovery to offer with conversion rates</p>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <PipelineFunnelChart stages={data.pipelineFunnel} />
              </CardContent>
            </Card>

            {/* Conversion rates between stages */}
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium">Stage Conversion Rates</CardTitle>
                <p className="text-xs text-muted-foreground">% progressing from each stage to the next</p>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.pipelineFunnel.slice(1)}
                    margin={{ top: 4, right: 16, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="conversionFromPrev" name="Conversion rate" radius={[3, 3, 0, 0]} barSize={32}>
                      {data.pipelineFunnel.slice(1).map((s, i) => (
                        <Cell key={i} fill={FUNNEL_COLORS[i + 1]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Section 3: Application Analytics ─────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Briefcase} label="Application Analytics" />
        {isLoading ? (
          <SkeletonGrid cols={2} h="h-56" />
        ) : data && (
          <div className="space-y-4">
            {/* Row 1: apps/week + interviews/month */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Applications per Week</CardTitle>
                  <p className="text-xs text-muted-foreground">Last 16 weeks</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={data.applicationsPerWeek} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 10 }} interval={2} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone" dataKey="count" name="Applications"
                        stroke="#6366f1" strokeWidth={2} dot={false}
                        activeDot={{ r: 4, fill: "#6366f1" }}
                      />
                    </LineChart>
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

            {/* Row 2: top companies + top titles */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Top Companies Applied</CardTitle>
                  <p className="text-xs text-muted-foreground">Most frequently applied</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {data.topCompanies.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No data yet</div>
                  ) : (
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
                  <CardTitle className="text-sm font-medium">Top Job Titles Applied</CardTitle>
                  <p className="text-xs text-muted-foreground">Most frequently applied</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {data.topTitles.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No data yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(200, data.topTitles.length * 32)}>
                      <BarChart data={data.topTitles} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="title" tick={{ fontSize: 10 }} width={130} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="count" name="Applications" radius={[0, 3, 3, 0]} barSize={12}>
                          {data.topTitles.map((_, i) => (
                            <Cell key={i} fill={PALETTE[(i + 3) % PALETTE.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Row 3: Work mode breakdown */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Remote vs Hybrid vs On-site</CardTitle>
                  <p className="text-xs text-muted-foreground">Work mode breakdown across applied jobs</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {data.workModeBreakdown.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No data yet</div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="55%" height={200}>
                        <PieChart>
                          <Pie
                            data={data.workModeBreakdown}
                            dataKey="count"
                            nameKey="mode"
                            cx="50%" cy="50%"
                            outerRadius={80}
                            innerRadius={44}
                            paddingAngle={2}
                          >
                            {data.workModeBreakdown.map((d, i) => (
                              <Cell key={i} fill={WORK_MODE_COLORS[d.mode] ?? PALETTE[i % PALETTE.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val: number) => [`${val} jobs`, ""]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-col gap-2 flex-1">
                        {data.workModeBreakdown.map((d, i) => (
                          <div key={d.mode} className="flex items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: WORK_MODE_COLORS[d.mode] ?? PALETTE[i % PALETTE.length] }}
                            />
                            <span className="text-xs text-muted-foreground flex-1">{d.mode}</span>
                            <span className="text-xs font-semibold">{d.count}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {data.totalApplications > 0
                                ? `${Math.round((d.count / data.totalApplications) * 100)}%`
                                : "0%"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Jobs added per day */}
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">Jobs Added per Day</CardTitle>
                  <p className="text-xs text-muted-foreground">Last 30 days</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={data.jobsPerDay} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 10 }} interval={4} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone" dataKey="count" name="Jobs"
                        stroke="#0ea5e9" strokeWidth={2} dot={false}
                        activeDot={{ r: 4, fill: "#0ea5e9" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 4: Time Analytics ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Clock} label="Time Analytics" />
        {isLoading ? (
          <SkeletonGrid cols={3} h="h-24" />
        ) : data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50 shrink-0">
                  <Calendar className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Posted → Applied</p>
                  <p className="text-2xl font-bold" data-testid="metric-days-posted-applied">
                    {data.avgDaysPostedToApplied != null ? `${data.avgDaysPostedToApplied}d` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.avgDaysPostedToApplied != null
                      ? data.avgDaysPostedToApplied <= 3 ? "Fast mover — great signal"
                        : data.avgDaysPostedToApplied <= 7 ? "Within a week"
                        : "Consider applying earlier"
                      : "No data yet"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-950/50 shrink-0">
                  <MessageSquare className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Applied → Interview</p>
                  <p className="text-2xl font-bold" data-testid="metric-days-applied-interview">
                    {data.avgDaysAppliedToInterview != null ? `${data.avgDaysAppliedToInterview}d` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.avgDaysAppliedToInterview != null
                      ? data.avgDaysAppliedToInterview <= 7 ? "Quick turnaround"
                        : data.avgDaysAppliedToInterview <= 14 ? "Typical pipeline"
                        : "Longer process"
                      : "No interview data yet"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/50 shrink-0">
                  <TrendingUp className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Between Applications</p>
                  <p className="text-2xl font-bold" data-testid="metric-days-between-apps">
                    {data.avgDaysBetweenApplications != null ? `${data.avgDaysBetweenApplications}d` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.avgDaysBetweenApplications != null
                      ? data.avgDaysBetweenApplications <= 1 ? "High application velocity"
                        : data.avgDaysBetweenApplications <= 3 ? "Good cadence"
                        : data.avgDaysBetweenApplications <= 7 ? "Moderate pace"
                        : "Consider applying more often"
                      : "Need 2+ applications"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Section 5: Resume Analytics ───────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Target} label="Resume Analytics" />
        {isLoading ? (
          <SkeletonGrid cols={2} h="h-56" />
        ) : data && (
          <div className="space-y-4">

            {/* Avg ATS + versions summary row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="Resume Versions" value={data.totalVersions}
                sub="Total saved versions"
                icon={FileText} color="text-indigo-500"
              />
              <MetricCard
                label="Avg ATS at Apply" value={data.avgAtsScoreApplied > 0 ? `${data.avgAtsScoreApplied}%` : "—"}
                sub="Across applied jobs"
                icon={Target} color={data.avgAtsScoreApplied >= 70 ? "text-green-500" : "text-amber-500"}
              />
              <MetricCard
                label="Avg ATS Before" value={data.avgAtsBefore > 0 ? `${data.avgAtsBefore}%` : "—"}
                sub="Pre-optimization average"
                icon={Zap} color="text-rose-500"
              />
              <MetricCard
                label="Avg ATS After" value={data.avgAtsAfter > 0 ? `${data.avgAtsAfter}%` : "—"}
                sub="Post-optimization average"
                icon={Zap} color="text-emerald-500"
                badge={data.avgAtsAfter > data.avgAtsBefore ? `+${data.avgAtsAfter - data.avgAtsBefore}pt gain` : undefined}
              />
            </div>

            {/* ATS distribution + ATS vs interview rate */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-sm font-medium">ATS Score Distribution</CardTitle>
                  <p className="text-xs text-muted-foreground">Applied jobs with ATS data</p>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {data.atsDistribution.every(d => d.count === 0) ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                      No ATS score data yet
                    </div>
                  ) : (
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
                  {data.atsVsInterviewRate.every(d => d.applied === 0) ? (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                      No ATS + interview data yet
                    </div>
                  ) : (
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

            {/* Resume version interview rate */}
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium">Resume Version Success Rate</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Interview rate per version (% of applications that led to an interview)
                </p>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {data.versionInterviewRate.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground text-sm text-center gap-2">
                    <FileText className="h-8 w-8 opacity-40" />
                    <p>Link resume versions to applications to see performance here.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, data.versionInterviewRate.length * 36)}>
                    <BarChart
                      data={data.versionInterviewRate}
                      layout="vertical"
                      margin={{ top: 4, right: 60, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                      <YAxis type="category" dataKey="version" tick={{ fontSize: 9 }} width={120} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine
                        x={data.conversionRate}
                        stroke="#6366f1" strokeDasharray="4 2"
                        label={{ value: `Avg ${data.conversionRate}%`, position: "right", fontSize: 9, fill: "#6366f1" }}
                      />
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
                {data.atsImprovements.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                    No optimization data yet
                  </div>
                ) : (
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
          </div>
        )}
      </div>

    </div>
  );
}
