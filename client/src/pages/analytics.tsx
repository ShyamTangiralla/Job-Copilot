import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine,
} from "recharts";
import {
  TrendingUp, Send, MessageSquare, Trophy, Target, Clock,
  Zap, BarChart3, FileText, Search, ArrowRight, Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AnalyticsData {
  totalJobs: number;
  totalJobsScraped: number;
  totalJobsImported: number;
  totalApplications: number;
  totalInterviews: number;
  conversionRate: number;
  avgAtsScoreApplied: number;
  avgDaysPostedToApplied: number | null;
  avgDaysAppliedToInterview: number | null;
  applicationsPerWeek: { week: string; count: number }[];
  jobsPerDay: { date: string; count: number }[];
  atsDistribution: { range: string; count: number }[];
  versionInterviewRate: { version: string; applied: number; interviews: number; rate: number }[];
  topCompanies: { company: string; count: number }[];
  topTitles: { title: string; count: number }[];
  atsImprovements: { label: string; before: number; after: number; delta: number }[];
  statusFunnel: { status: string; count: number }[];
  totalVersions: number;
  avgAtsBefore: number;
  avgAtsAfter: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtWeek(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PALETTE = [
  "#6366f1", "#8b5cf6", "#0ea5e9", "#06b6d4",
  "#10b981", "#f59e0b", "#f43f5e", "#84cc16",
];

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
          Full picture of your job search — applications, ATS scores, conversions, and resume performance.
        </p>
      </div>

      {/* ── Section 1: Application Metrics ────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Send} label="Application Metrics" />
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
            <MetricCard
              label="Resume Versions" value={data.totalVersions}
              sub={`Avg ${data.avgAtsBefore}% → ${data.avgAtsAfter}%`}
              icon={FileText} color="text-indigo-500"
            />
          </div>
        )}
      </div>

      {/* ── Section 2: Time Metrics ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Clock} label="Time Metrics" />
        {isLoading ? (
          <SkeletonGrid cols={2} h="h-20" />
        ) : data && (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Days: Posted → Applied</p>
                  <p className="text-2xl font-bold" data-testid="metric-days-posted-applied">
                    {data.avgDaysPostedToApplied != null ? `${data.avgDaysPostedToApplied}d` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.avgDaysPostedToApplied != null
                      ? data.avgDaysPostedToApplied <= 3 ? "Fast mover — great signal" : data.avgDaysPostedToApplied <= 7 ? "Within a week" : "Consider applying earlier"
                      : "No data yet"}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-950/50">
                  <MessageSquare className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Days: Applied → Interview</p>
                  <p className="text-2xl font-bold" data-testid="metric-days-applied-interview">
                    {data.avgDaysAppliedToInterview != null ? `${data.avgDaysAppliedToInterview}d` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.avgDaysAppliedToInterview != null
                      ? data.avgDaysAppliedToInterview <= 7 ? "Quick turnaround" : data.avgDaysAppliedToInterview <= 14 ? "Typical pipeline" : "Longer process"
                      : "No interview data yet"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Section 3: Time-series charts ─────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={TrendingUp} label="Activity Over Time" />
        {isLoading ? (
          <SkeletonGrid cols={2} h="h-56" />
        ) : data && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Applications per week */}
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

            {/* Jobs per day */}
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
        )}
      </div>

      {/* ── Section 4: ATS & Resume ───────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Target} label="ATS Score Analysis" />
        {isLoading ? (
          <SkeletonGrid cols={2} h="h-56" />
        ) : data && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* ATS distribution histogram */}
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

            {/* ATS improvement (before/after per version) */}
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium">Resume Version ATS Improvement</CardTitle>
                <p className="text-xs text-muted-foreground">Before vs After AI optimization</p>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {data.atsImprovements.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                    No optimization data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
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

      {/* ── Section 5: Resume Version vs Interview Rate ───────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Zap} label="Resume Version Performance" />
        {isLoading ? (
          <Skeleton className="h-56 w-full rounded-lg" />
        ) : data && (
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium">Interview Rate by Resume Version</CardTitle>
              <p className="text-xs text-muted-foreground">Versions linked to applied jobs (% got to interview)</p>
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
                    <ReferenceLine x={data.conversionRate} stroke="#6366f1" strokeDasharray="4 2" label={{ value: `Avg ${data.conversionRate}%`, position: "right", fontSize: 9, fill: "#6366f1" }} />
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
        )}
      </div>

      {/* ── Section 6: Top Companies & Titles ─────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Star} label="Where You've Applied" />
        {isLoading ? (
          <SkeletonGrid cols={2} h="h-56" />
        ) : data && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Top companies */}
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium">Top Companies</CardTitle>
                <p className="text-xs text-muted-foreground">Most frequently applied</p>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {data.topCompanies.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, data.topCompanies.length * 32)}>
                    <BarChart
                      data={data.topCompanies}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                    >
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

            {/* Top job titles */}
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium">Top Job Titles</CardTitle>
                <p className="text-xs text-muted-foreground">Most frequently applied</p>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                {data.topTitles.length === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, data.topTitles.length * 32)}>
                    <BarChart
                      data={data.topTitles}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                    >
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
        )}
      </div>

      {/* ── Section 7: Status Funnel ───────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={ArrowRight} label="Pipeline Funnel" />
        {isLoading ? (
          <Skeleton className="h-44 w-full rounded-lg" />
        ) : data && (
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-sm font-medium">Jobs by Status</CardTitle>
              <p className="text-xs text-muted-foreground">Full pipeline overview</p>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.statusFunnel} margin={{ top: 4, right: 8, left: -20, bottom: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="status" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Jobs" radius={[3, 3, 0, 0]} barSize={24}>
                    {data.statusFunnel.map((d, i) => {
                      const colors: Record<string, string> = {
                        New: "#94a3b8", Reviewed: "#f59e0b", "Ready to Apply": "#8b5cf6",
                        Saved: "#0ea5e9", Applied: "#10b981", Interview: "#06b6d4",
                        "Final Round": "#6366f1", Offer: "#eab308",
                        Rejected: "#f43f5e", "No Response": "#f97316",
                      };
                      return <Cell key={i} fill={colors[d.status] ?? "#94a3b8"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );
}
