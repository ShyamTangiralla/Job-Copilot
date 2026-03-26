import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileSpreadsheet,
  FileText,
  BarChart3,
  Activity,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ExportItem {
  id: string;
  title: string;
  description: string;
  format: "CSV" | "PDF";
  icon: React.ElementType;
  iconColor: string;
  endpoint: string;
  filename: string;
  bullets: string[];
}

const EXPORTS: ExportItem[] = [
  {
    id: "applications-csv",
    title: "Applications Data",
    description: "Complete export of all jobs and application tracking data.",
    format: "CSV",
    icon: FileSpreadsheet,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    endpoint: "/api/export/applications.csv",
    filename: "Applications.csv",
    bullets: [
      "All fields: title, company, status, source, location, work mode",
      "Date applied, interview date, recruiter contact date, decision date",
      "ATS score, offer details, salary range, follow-up date, notes",
      "Compatible with Excel, Google Sheets, or any CSV tool",
    ],
  },
  {
    id: "analytics-summary",
    title: "Analytics Summary",
    description: "Formatted PDF report with your key performance metrics and pipeline.",
    format: "PDF",
    icon: BarChart3,
    iconColor: "text-blue-600 dark:text-blue-400",
    endpoint: "/api/export/analytics-summary.pdf",
    filename: "Analytics_Summary.pdf",
    bullets: [
      "KPI cards: total jobs, applications, interviews, offers, conversion rate",
      "Application pipeline funnel with conversion rates at each stage",
      "Source performance table (LinkedIn, Indeed, Referral, etc.)",
      "Applications by role type and top companies applied",
    ],
  },
  {
    id: "resume-performance",
    title: "Resume Performance Report",
    description: "Per-version performance breakdown of all your resume versions.",
    format: "PDF",
    icon: FileText,
    iconColor: "text-violet-600 dark:text-violet-400",
    endpoint: "/api/export/resume-performance.pdf",
    filename: "Resume_Performance.pdf",
    bullets: [
      "Applications, interviews, and offers per resume version",
      "Interview rate and offer rate per version",
      "ATS score improvement from before → after optimization",
      "Best performing version highlighted",
    ],
  },
  {
    id: "job-activity",
    title: "Job Search Activity Report",
    description: "Weekly activity breakdown with your Job Search Score and company performance.",
    format: "PDF",
    icon: Activity,
    iconColor: "text-amber-600 dark:text-amber-400",
    endpoint: "/api/export/job-activity.pdf",
    filename: "Job_Activity_Report.pdf",
    bullets: [
      "Job Search Score (0–100) with grade",
      "Week-by-week: applications, interviews, rejections, networking, follow-ups",
      "Offers per month chart data",
      "Company performance table: applied, interviews, offers, interview rate",
    ],
  },
];

// ─── Export card ───────────────────────────────────────────────────────────────
function ExportCard({ item }: { item: ExportItem }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const { toast } = useToast();

  const handleDownload = async () => {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch(item.endpoint);
      if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().split("T")[0];
      a.download = item.filename.replace(".", `_${date}.`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("done");
      toast({ title: "Download started", description: `${item.title} export is downloading.` });
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err: any) {
      setStatus("idle");
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  };

  const formatBadgeColor =
    item.format === "CSV"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-0";

  return (
    <Card className="flex flex-col" data-testid={`card-export-${item.id}`}>
      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <item.icon className={`h-5 w-5 ${item.iconColor}`} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{item.title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
            </div>
          </div>
          <Badge className={`shrink-0 text-[10px] font-bold px-1.5 ${formatBadgeColor}`}>
            {item.format}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 flex flex-col flex-1 gap-3">
        <ul className="space-y-1">
          {item.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60" />
              {b}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-1">
          <Button
            className="w-full gap-2"
            variant={status === "done" ? "outline" : "default"}
            onClick={handleDownload}
            disabled={status === "loading"}
            data-testid={`button-download-${item.id}`}
          >
            {status === "loading" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            ) : status === "done" ? (
              <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Downloaded</>
            ) : (
              <><Download className="h-4 w-4" /> Export {item.format}</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function ExportCenter() {
  const { toast } = useToast();
  const [bulkLoading, setBulkLoading] = useState(false);

  const handleExportAll = async () => {
    setBulkLoading(true);
    let succeeded = 0;
    for (const item of EXPORTS) {
      try {
        const res = await fetch(item.endpoint);
        if (!res.ok) continue;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const date = new Date().toISOString().split("T")[0];
        a.download = item.filename.replace(".", `_${date}.`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        succeeded++;
        await new Promise(r => setTimeout(r, 600));
      } catch {}
    }
    setBulkLoading(false);
    toast({ title: `${succeeded}/${EXPORTS.length} exports downloaded`, description: "Check your Downloads folder." });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Export Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Download your job search data and reports in CSV or PDF format.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2 shrink-0"
          onClick={handleExportAll}
          disabled={bulkLoading}
          data-testid="button-export-all"
        >
          {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export All
        </Button>
      </div>

      {/* Format legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0 text-[10px]">CSV</Badge>
          Spreadsheet — open in Excel, Google Sheets, or any data tool
        </div>
        <div className="flex items-center gap-1.5">
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-0 text-[10px]">PDF</Badge>
          Formatted report — share with recruiters or save for reference
        </div>
      </div>

      {/* Export cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXPORTS.map(item => (
          <ExportCard key={item.id} item={item} />
        ))}
      </div>

      {/* Note */}
      <p className="text-xs text-muted-foreground text-center pt-2">
        All exports reflect your current data at the time of download. Re-export anytime for an up-to-date copy.
      </p>
    </div>
  );
}
