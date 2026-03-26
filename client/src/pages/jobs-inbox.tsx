import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import {
  Plus,
  Search,
  ExternalLink,
  Filter,
  X,
  AlertTriangle,
  Building,
  MapPin,
  Clock,
  Target,
  FileText,
  Sparkles,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Job, Resume } from "@shared/schema";
import { JOB_STATUSES, WORK_MODES, PRIORITIES, FRESHNESS_LABELS, APPLY_PRIORITY_LABELS } from "@shared/schema";

interface SettingsData {
  roleCategories: string[];
  sources: string[];
  statuses: string[];
}

export default function JobsInbox() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [keyword, setKeyword] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterWorkMode, setFilterWorkMode] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterFreshness, setFilterFreshness] = useState("all");
  const [filterApplyPriority, setFilterApplyPriority] = useState("all");
  const [filterMinScore, setFilterMinScore] = useState("all");
  const [filterImportSource, setFilterImportSource] = useState("all");
  const [filterScanBatch, setFilterScanBatch] = useState("all");
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "imported" | "ats">("score");
  const [showFilters, setShowFilters] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Job | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  const { data: jobs, isLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const { data: settings } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

  const roleTypes = settings?.roleCategories ?? [];

  const { data: resumes } = useQuery<Resume[]>({
    queryKey: ["/api/resumes"],
  });

  const getRecommendedResumeName = (job: Job) => {
    if (!resumes || !job.resumeRecommendation) return null;
    const match = resumes.find((r) => r.roleType === job.resumeRecommendation && r.active);
    return match?.name ?? null;
  };

  interface ATSBreakdown {
    atsScore: number;
    keywordOverlapPct: number;
    skillsOverlapPct: number;
    roleKeywordOverlapPct: number;
    matchedKeywords: string[];
    matchedSkills: string[];
    matchedRoleKeywords: string[];
    missingSkills: string[];
    resumeName: string | null;
  }

  const { data: atsBreakdown, isLoading: atsLoading } = useQuery<ATSBreakdown>({
    queryKey: ["/api/jobs", selectedJob?.id, "ats-breakdown"],
    enabled: !!selectedJob,
  });

  const updateJobStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/jobs/${id}`, { status });
      return res.json();
    },
    onSuccess: (updated: Job) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setSelectedJob(updated);
      toast({ title: `Job marked as ${updated.status}` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update status", description: err?.message ?? "Please try again.", variant: "destructive" });
    },
  });

  const createJob = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/jobs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setDialogOpen(false);
      setDuplicateWarning(null);
      toast({ title: "Job added successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add job", description: err?.message ?? "Please try again.", variant: "destructive" });
    },
  });

  const checkDuplicate = async (title: string, company: string, applyLink: string) => {
    if (!title || !company) return;
    try {
      const res = await apiRequest("POST", "/api/jobs/check-duplicate", { title, company, applyLink });
      const data = await res.json();
      if (data.isDuplicate) {
        setDuplicateWarning(data.existingJob);
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      setDuplicateWarning(null);
    }
  };

  const sources = [...new Set(jobs?.map((j) => j.source).filter(Boolean) ?? [])];

  // Scan batches from all jobs that have a label
  const scanBatches = [...new Set(jobs?.map((j) => j.scanBatchLabel).filter(Boolean) ?? [])].sort().reverse();

  // All import source values mapped to friendly labels
  const IMPORT_SOURCE_LABELS: Record<string, string> = {
    "linkedin-search": "LinkedIn Search",
    "discovery": "Discovery",
    "url": "URL Import",
    "email": "Email",
    "bulk-paste": "Bulk Paste",
    "bulk-urls": "Bulk URLs",
    "__manual__": "Manual Add",
  };
  const importSources = [...new Set(
    jobs?.map((j) => j.importSource || "__manual__").filter(Boolean) ?? []
  )];

  const filtered = (jobs ?? []).filter((job) => {
    if (quickFilter) {
      const now = new Date();
      const created = job.createdAt ? new Date(job.createdAt) : null;
      const hoursAgo = created ? (now.getTime() - created.getTime()) / (1000 * 60 * 60) : Infinity;
      switch (quickFilter) {
        case "today":
          if (hoursAgo > 24) return false;
          break;
        case "72h":
          if (hoursAgo > 72) return false;
          break;
        case "7d":
          if (hoursAgo > 168) return false;
          break;
        case "score60":
          if (job.applyPriorityScore < 60) return false;
          break;
        case "score70":
          if (job.applyPriorityScore < 70) return false;
          break;
        case "primary":
          if (!["Data Analyst", "Healthcare Data Analyst", "Business Analyst", "Financial Analyst", "BI Analyst"].includes(job.roleClassification)) return false;
          break;
        case "remote":
          if (job.workMode !== "Remote") return false;
          break;
      }
    }
    if (keyword) {
      const k = keyword.toLowerCase();
      if (
        !job.title.toLowerCase().includes(k) &&
        !job.company.toLowerCase().includes(k) &&
        !job.location.toLowerCase().includes(k)
      )
        return false;
    }
    if (filterRole !== "all" && job.roleClassification !== filterRole) return false;
    if (filterStatus !== "all" && job.status !== filterStatus) return false;
    if (filterWorkMode !== "all" && job.workMode !== filterWorkMode) return false;
    if (filterSource !== "all" && job.source !== filterSource) return false;
    if (filterPriority !== "all" && job.priority !== filterPriority) return false;
    if (filterFreshness !== "all" && job.freshnessLabel !== filterFreshness) return false;
    if (filterApplyPriority !== "all" && job.applyPriorityLabel !== filterApplyPriority) return false;
    if (filterMinScore !== "all" && job.applyPriorityScore < parseInt(filterMinScore)) return false;
    if (filterImportSource !== "all") {
      const jobImportSource = job.importSource || "__manual__";
      if (jobImportSource !== filterImportSource) return false;
    }
    if (filterScanBatch !== "all" && job.scanBatchLabel !== filterScanBatch) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "imported") {
      const aTime = a.importedAt ? new Date(a.importedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const bTime = b.importedAt ? new Date(b.importedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return bTime - aTime;
    }
    if (sortBy === "ats") {
      return (b.atsScore ?? 0) - (a.atsScore ?? 0);
    }
    const scoreDiff = (b.applyPriorityScore ?? 0) - (a.applyPriorityScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const freshnessOrder: Record<string, number> = { "Fresh 24h": 0, "Fresh 48h": 1, "Unknown Date": 2, "": 3 };
    const freshDiff = (freshnessOrder[a.freshnessLabel] ?? 3) - (freshnessOrder[b.freshnessLabel] ?? 3);
    if (freshDiff !== 0) return freshDiff;
    const fitOrder: Record<string, number> = { "Strong Match": 0, "Possible Match": 1, "Weak Match": 2, "": 3 };
    const fitDiff = (fitOrder[a.fitLabel] ?? 3) - (fitOrder[b.fitLabel] ?? 3);
    if (fitDiff !== 0) return fitDiff;
    const statusOrder: Record<string, number> = { "Ready to Apply": 0 };
    return (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
  });

  const fitColor: Record<string, string> = {
    "Strong Match": "default",
    "Possible Match": "secondary",
    "Weak Match": "outline",
  };

  const statusColor: Record<string, string> = {
    New: "secondary",
    Reviewed: "default",
    "Ready to Apply": "default",
    Applied: "default",
    Skipped: "secondary",
    Interview: "default",
    Rejected: "destructive",
  };

  const priorityColor: Record<string, string> = {
    High: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30",
    Medium: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
    Low: "text-muted-foreground bg-muted/40",
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = (fd.get("title") as string ?? "").trim();
    const company = (fd.get("company") as string ?? "").trim();
    const applyLink = (fd.get("applyLink") as string ?? "").trim();
    if (!title) {
      toast({ title: "Job title is required", variant: "destructive" });
      return;
    }
    if (!company) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }
    createJob.mutate({
      title,
      company,
      source: fd.get("source") as string,
      location: fd.get("location") as string,
      workMode: fd.get("workMode") as string,
      datePosted: fd.get("datePosted") as string,
      description: fd.get("description") as string,
      applyLink,
      priority: fd.get("priority") as string,
      notes: fd.get("notes") as string,
      followUpDate: fd.get("followUpDate") as string,
    });
  };

  const freshnessColor: Record<string, string> = {
    "Fresh 24h": "default",
    "Fresh 48h": "secondary",
    "Unknown Date": "outline",
  };

  const applyPriorityColor: Record<string, string> = {
    "Apply Immediately": "default",
    "High Priority": "default",
    "Medium Priority": "secondary",
    "Low Priority": "outline",
  };

  const activeFilterCount = [filterRole, filterStatus, filterWorkMode, filterSource, filterPriority, filterFreshness, filterApplyPriority, filterMinScore, filterImportSource, filterScanBatch].filter((f) => f !== "all").length;

  const quickFilters = [
    { key: "today", label: "Imported Today" },
    { key: "72h", label: "Last 72 Hours" },
    { key: "7d", label: "Last 7 Days" },
    { key: "score70", label: "Score ≥ 70" },
    { key: "score60", label: "Score ≥ 60" },
    { key: "primary", label: "Primary Role" },
    { key: "remote", label: "Remote Only" },
  ];

  return (
    <>
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Jobs Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} job{filtered.length !== 1 ? "s" : ""} found
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setDuplicateWarning(null); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-job">
              <Plus className="h-4 w-4 mr-1" />
              Quick Add Job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Quick Add Job</DialogTitle>
            </DialogHeader>
            {duplicateWarning && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Possible duplicate found: "{duplicateWarning.title}" at {duplicateWarning.company} (Status: {duplicateWarning.status}). You can still add it.
                </AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="title">Job Title *</Label>
                  <Input
                    id="title"
                    name="title"
                    required
                    onBlur={(e) => {
                      const form = e.target.closest("form");
                      if (form) {
                        const fd = new FormData(form);
                        checkDuplicate(fd.get("title") as string, fd.get("company") as string, fd.get("applyLink") as string);
                      }
                    }}
                    data-testid="input-job-title"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company">Company *</Label>
                  <Input
                    id="company"
                    name="company"
                    required
                    onBlur={(e) => {
                      const form = e.target.closest("form");
                      if (form) {
                        const fd = new FormData(form);
                        checkDuplicate(fd.get("title") as string, fd.get("company") as string, fd.get("applyLink") as string);
                      }
                    }}
                    data-testid="input-job-company"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="source">Source</Label>
                  <Input id="source" name="source" placeholder="LinkedIn, Indeed..." data-testid="input-job-source" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" name="location" data-testid="input-job-location" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="workMode">Work Mode</Label>
                  <select name="workMode" id="workMode" className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" data-testid="select-work-mode">
                    {WORK_MODES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="datePosted">Date Posted</Label>
                  <Input id="datePosted" name="datePosted" type="date" data-testid="input-date-posted" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="priority">Priority</Label>
                  <select name="priority" id="priority" className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" data-testid="select-priority">
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="applyLink">Apply Link</Label>
                <Input
                  id="applyLink"
                  name="applyLink"
                  type="url"
                  placeholder="https://..."
                  onBlur={(e) => {
                    const form = e.target.closest("form");
                    if (form) {
                      const fd = new FormData(form);
                      checkDuplicate(fd.get("title") as string, fd.get("company") as string, fd.get("applyLink") as string);
                    }
                  }}
                  data-testid="input-apply-link"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Job Description</Label>
                <Textarea id="description" name="description" rows={5} placeholder="Paste the full job description here..." data-testid="input-description" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" rows={2} data-testid="input-notes" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="followUpDate">Follow-up Date</Label>
                  <Input id="followUpDate" name="followUpDate" type="date" data-testid="input-followup-date" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Role type and resume recommendation will be auto-classified based on title and description.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => { setDialogOpen(false); setDuplicateWarning(null); }} data-testid="button-cancel-job">
                  Cancel
                </Button>
                <Button type="submit" disabled={createJob.isPending} data-testid="button-submit-job">
                  {createJob.isPending ? "Adding..." : "Add Job"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap" data-testid="quick-filters">
        {quickFilters.map((qf) => (
          <Button
            key={qf.key}
            variant={quickFilter === qf.key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setQuickFilter(quickFilter === qf.key ? null : qf.key)}
            data-testid={`quick-filter-${qf.key}`}
          >
            {qf.label}
          </Button>
        ))}
        {quickFilter && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setQuickFilter(null)} data-testid="quick-filter-clear">
            <X className="h-3 w-3 mr-1" />Clear
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Sort:</span>
          <Button
            variant={sortBy === "score" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSortBy("score")}
            data-testid="sort-by-score"
          >
            By Score
          </Button>
          <Button
            variant={sortBy === "imported" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSortBy("imported")}
            data-testid="sort-by-imported"
          >
            Newest First
          </Button>
          <Button
            variant={sortBy === "ats" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSortBy("ats")}
            data-testid="sort-by-ats"
          >
            ATS Score
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-8"
            data-testid="input-search-jobs"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters"
        >
          <Filter className="h-4 w-4 mr-1" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="space-y-1 min-w-[140px]">
                <Label className="text-xs">Role Type</Label>
                <Select value={filterRole} onValueChange={setFilterRole}>
                  <SelectTrigger data-testid="select-filter-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {roleTypes.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[140px]">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger data-testid="select-filter-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {JOB_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[140px]">
                <Label className="text-xs">Work Mode</Label>
                <Select value={filterWorkMode} onValueChange={setFilterWorkMode}>
                  <SelectTrigger data-testid="select-filter-workmode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modes</SelectItem>
                    {WORK_MODES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[140px]">
                <Label className="text-xs">Priority</Label>
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger data-testid="select-filter-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[140px]">
                <Label className="text-xs">Freshness</Label>
                <Select value={filterFreshness} onValueChange={setFilterFreshness}>
                  <SelectTrigger data-testid="select-filter-freshness"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Freshness</SelectItem>
                    {FRESHNESS_LABELS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[140px]">
                <Label className="text-xs">Apply Priority</Label>
                <Select value={filterApplyPriority} onValueChange={setFilterApplyPriority}>
                  <SelectTrigger data-testid="select-filter-apply-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    {APPLY_PRIORITY_LABELS.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[140px]">
                <Label className="text-xs">Min Apply Score</Label>
                <Select value={filterMinScore} onValueChange={setFilterMinScore}>
                  <SelectTrigger data-testid="select-filter-min-score"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Score</SelectItem>
                    <SelectItem value="90">90+</SelectItem>
                    <SelectItem value="75">75+</SelectItem>
                    <SelectItem value="60">60+</SelectItem>
                    <SelectItem value="40">40+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {sources.length > 0 && (
                <div className="space-y-1 min-w-[140px]">
                  <Label className="text-xs">Source</Label>
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger data-testid="select-filter-source"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      {sources.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {importSources.length > 0 && (
                <div className="space-y-1 min-w-[160px]">
                  <Label className="text-xs">Import Source</Label>
                  <Select value={filterImportSource} onValueChange={setFilterImportSource}>
                    <SelectTrigger data-testid="select-filter-import-source"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Import Sources</SelectItem>
                      {importSources.map((s) => (
                        <SelectItem key={s} value={s}>
                          {IMPORT_SOURCE_LABELS[s] ?? s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {scanBatches.length > 0 && (
                <div className="space-y-1 min-w-[200px]">
                  <Label className="text-xs">Scan Batch</Label>
                  <Select value={filterScanBatch} onValueChange={setFilterScanBatch}>
                    <SelectTrigger data-testid="select-filter-scan-batch"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Batches</SelectItem>
                      {scanBatches.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="mt-5"
                onClick={() => { setFilterRole("all"); setFilterStatus("all"); setFilterWorkMode("all"); setFilterSource("all"); setFilterPriority("all"); setFilterFreshness("all"); setFilterApplyPriority("all"); setFilterMinScore("all"); setFilterImportSource("all"); setFilterScanBatch("all"); }}
                data-testid="button-clear-filters"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Search className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No jobs found. Add your first job to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Job Title</TableHead>
                    <TableHead className="min-w-[120px]">Company</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Classification</TableHead>
                    <TableHead>Recommended Resume</TableHead>
                    <TableHead>Apply Score</TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-foreground"
                      onClick={() => setSortBy("ats")}
                      data-testid="th-ats-score"
                    >
                      ATS Score{sortBy === "ats" && " ↓"}
                    </TableHead>
                    <TableHead>Apply Priority</TableHead>
                    <TableHead>Freshness</TableHead>
                    <TableHead>Fit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((job) => (
                    <TableRow
                      key={job.id}
                      className={`cursor-pointer ${selectedJob?.id === job.id ? "bg-muted/50" : ""}`}
                      onClick={() => { setSelectedJob(job); setDescExpanded(false); }}
                      data-testid={`row-job-${job.id}`}
                    >
                      <TableCell>
                        <span className="font-medium">{job.title}</span>
                        {job.followUpDate && (
                          <span className="block text-xs text-muted-foreground mt-0.5">
                            Follow-up: {job.followUpDate}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{job.company}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{job.source}</TableCell>
                      <TableCell className="text-sm">{job.location}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{job.workMode}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${priorityColor[job.priority] ?? ""}`}>
                          {job.priority}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{job.roleClassification}</TableCell>
                      <TableCell>
                        {(() => {
                          const resumeName = getRecommendedResumeName(job);
                          return resumeName ? (
                            <span className="text-sm" data-testid={`text-recommended-resume-${job.id}`}>{resumeName}</span>
                          ) : job.resumeRecommendation ? (
                            <span className="text-xs text-muted-foreground italic" data-testid={`text-recommended-resume-${job.id}`}>No active resume</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-sm" data-testid={`text-apply-score-${job.id}`}>
                          {job.applyPriorityScore}
                        </span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const score = job.atsScore ?? 0;
                          const colorClass = score >= 70
                            ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
                            : score >= 40
                            ? "text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30"
                            : "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
                          return (
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-md ${colorClass}`}
                              data-testid={`text-ats-score-${job.id}`}
                            >
                              {score}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {job.applyPriorityLabel && (
                          <Badge variant={applyPriorityColor[job.applyPriorityLabel] as any ?? "secondary"} className="text-xs" data-testid={`badge-apply-priority-${job.id}`}>
                            {job.applyPriorityLabel}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {job.freshnessLabel && (
                          <Badge variant={freshnessColor[job.freshnessLabel] as any ?? "secondary"} className="text-xs" data-testid={`badge-freshness-${job.id}`}>
                            {job.freshnessLabel}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {job.fitLabel && (
                          <Badge variant={fitColor[job.fitLabel] as any ?? "secondary"} className="text-xs">
                            {job.fitLabel}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColor[job.status] as any ?? "secondary"} className="text-xs">
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}`); }}
                          data-testid={`button-view-detail-${job.id}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
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

    <Sheet open={!!selectedJob} onOpenChange={(open) => { if (!open) setSelectedJob(null); }}>
      <SheetContent side="right" className="w-[520px] sm:w-[580px] overflow-y-auto p-0">
        {selectedJob && (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-lg leading-tight">{selectedJob.title}</SheetTitle>
                  <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="flex items-center gap-1"><Building className="h-3.5 w-3.5" />{selectedJob.company}</span>
                    {selectedJob.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{selectedJob.location}</span>}
                    {selectedJob.workMode && <Badge variant="secondary" className="text-xs">{selectedJob.workMode}</Badge>}
                  </SheetDescription>
                </div>
                <SheetClose data-testid="button-close-panel" />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => navigate(`/jobs/${selectedJob.id}/optimize`)}
                  data-testid="button-panel-optimize"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Optimize Resume
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/jobs/${selectedJob.id}?tab=cover-letter`)} data-testid="button-panel-cover-letter">
                  <FileText className="h-3.5 w-3.5" />
                  Cover Letter
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 ml-auto" onClick={() => navigate(`/jobs/${selectedJob.id}`)} data-testid="button-panel-full-detail">
                  <ArrowRight className="h-3.5 w-3.5" />
                  Full Details
                </Button>
              </div>
            </SheetHeader>

            <div className="px-6 py-4 space-y-4">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm">Job Info</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <span className="text-muted-foreground">Status</span>
                      <div className="mt-0.5">
                        <Badge variant={statusColor[selectedJob.status] as any ?? "secondary"} className="text-xs">{selectedJob.status}</Badge>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Priority</span>
                      <div className="mt-0.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${priorityColor[selectedJob.priority] ?? ""}`}>{selectedJob.priority}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Source</span>
                      <div className="mt-0.5 font-medium">{selectedJob.source || "—"}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Classification</span>
                      <div className="mt-0.5 font-medium">{selectedJob.roleClassification || "—"}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Apply Score</span>
                      <div className="mt-0.5 font-semibold">{selectedJob.applyPriorityScore ?? "—"}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fit</span>
                      <div className="mt-0.5">
                        {selectedJob.fitLabel ? (
                          <Badge variant={fitColor[selectedJob.fitLabel] as any ?? "secondary"} className="text-xs">{selectedJob.fitLabel}</Badge>
                        ) : "—"}
                      </div>
                    </div>
                    {selectedJob.scanBatchLabel && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Scan Batch</span>
                        <div className="mt-0.5 font-medium text-xs">{selectedJob.scanBatchLabel}</div>
                      </div>
                    )}
                  </div>
                  {selectedJob.applyLink && (
                    <div className="pt-1">
                      <a
                        href={selectedJob.applyLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="link-panel-apply"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Job Posting
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    ATS Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {atsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-5/6" />
                    </div>
                  ) : atsBreakdown ? (
                    <>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">Overall ATS Score</span>
                          <span className={`font-bold ${atsBreakdown.atsScore >= 70 ? "text-green-600 dark:text-green-400" : atsBreakdown.atsScore >= 40 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                            {atsBreakdown.atsScore}%
                          </span>
                        </div>
                        <Progress value={atsBreakdown.atsScore} className="h-2" />
                      </div>

                      <Separator />

                      <div className="space-y-2.5 text-sm">
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-muted-foreground">Keyword Overlap</span>
                            <span className="font-medium">{atsBreakdown.keywordOverlapPct}%</span>
                          </div>
                          <Progress value={atsBreakdown.keywordOverlapPct} className="h-1.5" />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-muted-foreground">Skills / Tools</span>
                            <span className="font-medium">{atsBreakdown.skillsOverlapPct}%</span>
                          </div>
                          <Progress value={atsBreakdown.skillsOverlapPct} className="h-1.5" />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-muted-foreground">Role Keywords</span>
                            <span className="font-medium">{atsBreakdown.roleKeywordOverlapPct}%</span>
                          </div>
                          <Progress value={atsBreakdown.roleKeywordOverlapPct} className="h-1.5" />
                        </div>
                      </div>

                      {atsBreakdown.resumeName && (
                        <p className="text-xs text-muted-foreground">Scored against: <span className="font-medium">{atsBreakdown.resumeName}</span></p>
                      )}

                      {atsBreakdown.matchedSkills.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-green-500" /> Matched Skills</p>
                          <div className="flex flex-wrap gap-1">
                            {atsBreakdown.matchedSkills.map((s) => (
                              <Badge key={s} variant="secondary" className="text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400">{s}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {atsBreakdown.missingSkills.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1.5 flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-red-500" /> Missing Skills</p>
                          <div className="flex flex-wrap gap-1">
                            {atsBreakdown.missingSkills.map((s) => (
                              <Badge key={s} variant="secondary" className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400">{s}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No ATS data available. Add a resume to enable scoring.</p>
                  )}
                </CardContent>
              </Card>

              {selectedJob.description && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Job Description
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div
                      className={`text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none overflow-hidden transition-all ${descExpanded ? "" : "max-h-[200px]"}`}
                      dangerouslySetInnerHTML={{ __html: selectedJob.description }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full text-xs gap-1"
                      onClick={() => setDescExpanded(!descExpanded)}
                      data-testid="button-toggle-desc"
                    >
                      {descExpanded ? <><ChevronUp className="h-3.5 w-3.5" />Show Less</> : <><ChevronDown className="h-3.5 w-3.5" />Show More</>}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="px-4 py-4">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Quick Actions</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedJob.status !== "Applied" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
                        onClick={() => updateJobStatus.mutate({ id: selectedJob.id, status: "Applied" })}
                        disabled={updateJobStatus.isPending}
                        data-testid="button-mark-applied"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Mark as Applied
                      </Button>
                    )}
                    {selectedJob.status !== "Rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                        onClick={() => updateJobStatus.mutate({ id: selectedJob.id, status: "Rejected" })}
                        disabled={updateJobStatus.isPending}
                        data-testid="button-skip-job"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Skip Job
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 ml-auto"
                      onClick={() => navigate(`/jobs/${selectedJob.id}`)}
                      data-testid="button-panel-goto-full"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      History & Notes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
    </>
  );
}
