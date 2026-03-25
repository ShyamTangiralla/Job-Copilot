import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Play, Square, Save, Search, CheckCircle2, XCircle, AlertTriangle, Clock, Globe, Building2, Zap, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { SiLinkedin } from "react-icons/si";
import type { DiscoveryResult, DiscoveryRun } from "@shared/schema";

interface LinkedInJobResult {
  title: string;
  company: string;
  location: string;
  applyLink: string;
  jobUrl: string;
  datePosted: string;
  source: string;
  description: string;
  dedupeKey: string;
}

interface DiscoverySettings {
  primaryRoles: string[];
  secondaryRoles: string[];
  preferredLocations: string[];
  workModes: string[];
  maxJobsPerScan: number;
  searchKeywords: string[];
  excludeKeywords: string[];
  jobAgeFilter: string;
  preferredFreshness: string;
  dailyImportCap: number;
  sources: {
    googleJobs: boolean;
    greenhouse: boolean;
    lever: boolean;
    workday: boolean;
    companyCareerPages: boolean;
    emailAlerts: boolean;
  };
  scheduler: string;
}

function TagInput({ label, values, onChange, placeholder, testId }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; testId: string;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
      setInput("");
    }
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder={placeholder}
          data-testid={`input-${testId}`}
          className="flex-1 h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} data-testid={`button-add-${testId}`} className="h-8 px-3 text-xs">Add</Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="cursor-pointer text-xs" onClick={() => removeTag(v)} data-testid={`tag-${testId}-${v}`}>
              {v} <XCircle className="h-3 w-3 ml-1" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightweight preview ranking — runs on the client before import so we can
// send the best-matching jobs first.  No AI call needed.
// ---------------------------------------------------------------------------

function computePreviewScore(job: LinkedInJobResult, searchRoles: string): number {
  let score = 0;
  const titleLower = (job.title ?? "").toLowerCase();
  const descLower  = (job.description ?? "").toLowerCase();
  const locLower   = (job.location ?? "").toLowerCase();

  // ── Title relevance (0–40 pts) ───────────────────────────────────────────
  const roles = searchRoles
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  outer: for (const role of roles) {
    const words = role.split(/\s+/).filter((w) => w.length > 2);
    const matched = words.filter((w) => titleLower.includes(w));
    if (words.length > 0 && matched.length === words.length) { score += 40; break outer; }
    if (matched.length > 0)                                   { score += 20; break outer; }
  }

  // ── Freshness (0–25 pts) ─────────────────────────────────────────────────
  const fp = job.datePosted ?? "";
  if      (fp.includes("24h")) score += 25;
  else if (fp.includes("48h")) score += 20;
  else if (fp.includes("72h")) score += 12;
  else if (fp.includes("7d"))  score += 5;

  // ── Remote / hybrid signal (0–20 pts) ───────────────────────────────────
  const combined = `${locLower} ${descLower}`;
  if (combined.includes("fully remote") || combined.includes("100% remote") || combined.includes("work from home")) score += 20;
  else if (combined.includes("remote"))  score += 15;
  else if (combined.includes("hybrid"))  score += 8;

  // ── Description quality (0–15 pts) ──────────────────────────────────────
  const dl = descLower.length;
  if (dl > 2000) score += 15;
  else if (dl > 500) score += 8;

  return Math.min(score, 100);
}

function getPriorityTier(score: number): { label: string; className: string } {
  if (score >= 80) return { label: "Apply Now",      className: "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-900/30 dark:border-green-700" };
  if (score >= 60) return { label: "Strong Match",   className: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-900/30 dark:border-blue-700" };
  if (score >= 40) return { label: "Moderate Match", className: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-700" };
  return                   { label: "Low Match",      className: "text-muted-foreground bg-muted/40 border-muted" };
}

// ---------------------------------------------------------------------------

function ResultsBadge({ result }: { result: string }) {
  switch (result) {
    case "imported":
      return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Imported</Badge>;
    case "failed":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case "duplicate":
      return <Badge variant="secondary"><AlertTriangle className="h-3 w-3 mr-1" />Duplicate</Badge>;
    case "pending":
      return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    default:
      return <Badge variant="outline">{result}</Badge>;
  }
}

export default function JobDiscovery() {
  const { toast } = useToast();
  const [configOpen, setConfigOpen] = useState(true);
  const [local, setLocal] = useState<DiscoverySettings | null>(null);

  // LinkedIn Search state
  const [apifyToken, setApifyToken] = useState("");
  const [liRoles, setLiRoles] = useState("");
  const [liLocation, setLiLocation] = useState("United States");
  const [liResults, setLiResults] = useState<LinkedInJobResult[]>([]);
  const [liError, setLiError] = useState<string | null>(null);
  const [selectedJobIndices, setSelectedJobIndices] = useState<Set<number>>(new Set());
  const [liImportSummary, setLiImportSummary] = useState<{
    imported: number; duplicates: number; failed: number; repaired: number;
    insufficient: number; junk: number; missingIds: number; rawCount: number;
    scanBatchLabel?: string;
    skipLog?: { title: string; reason: string }[];
  } | null>(null);
  const [liSearchCount, setLiSearchCount] = useState<number>(0);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; batchLabel: string } | null>(null);
  const [liDebug, setLiDebug] = useState<{
    actorId: string;
    rolesSent: string[];
    locationSent: string;
    runId: string;
    datasetId: string;
    rawItemCount: number;
    status: string;
    payloadSent: object;
    error?: string;
    rawSampleItem?: Record<string, any>;
    parsedSampleItem?: Record<string, string>;
  } | null>(null);

  const liSearchMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/search-jobs", {
        roles: liRoles,
        location: liLocation,
        apifyToken,
      }).then((r) => r.json()),
    onSuccess: (data: { results: LinkedInJobResult[]; count: number; debug?: any }) => {
      const results = data.results ?? [];
      setLiResults(results);
      setLiSearchCount(results.length);
      if (data.debug) {
        setLiDebug({
          actorId: data.debug.actorId ?? "",
          rolesSent: data.debug.rolesSent ?? [],
          locationSent: data.debug.locationSent ?? "",
          runId: data.debug.runId ?? "",
          datasetId: data.debug.datasetId ?? "",
          rawItemCount: data.debug.rawItemCount ?? 0,
          status: data.debug.status ?? "",
          payloadSent: data.debug.payloadSent ?? {},
          error: data.debug.error,
          rawSampleItem: data.debug.rawSampleItem,
          parsedSampleItem: data.debug.parsedSampleItem,
        });
      } else {
        setLiDebug(null);
      }
      setLiError(null);
      setSelectedJobIndices(new Set());
      setLiImportSummary(null);
      if (results.length === 0) {
        toast({ title: "No results", description: "Apify returned 0 jobs. See the debug panel below for actorId, runId, and dataset item count." });
      } else {
        toast({ title: `${data.count} jobs found`, description: "Results shown below. Select jobs to import into your inbox." });
      }
    },
    onError: (err: any) => {
      setLiError(err?.message ?? "Search failed");
      toast({ title: "Search Failed", description: err?.message, variant: "destructive" });
    },
  });

  const liImportMutation = useMutation({
    mutationFn: (jobs: LinkedInJobResult[]) =>
      apiRequest("POST", "/api/import-linkedin-jobs", { jobs }).then((r) => r.json()),
    onSuccess: (data: { imported: number; duplicates: number; failed: number; repaired: number; insufficient: number; junk?: number; missingIds: number; rawCount: number; scanBatchLabel: string; skipLog?: { title: string; reason: string }[] }) => {
      setLiImportSummary({ ...data, junk: data.junk ?? 0 });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      const parts: string[] = [];
      if (data.imported > 0)            parts.push(`${data.imported} imported`);
      if (data.repaired > 0)            parts.push(`${data.repaired} repaired`);
      if (data.duplicates > 0)          parts.push(`${data.duplicates} duplicate${data.duplicates !== 1 ? "s" : ""}`);
      if ((data.junk ?? 0) > 0)         parts.push(`${data.junk} invalid`);
      if (data.insufficient > 0)        parts.push(`${data.insufficient} missing fields`);
      if (data.failed > 0)              parts.push(`${data.failed} error${data.failed !== 1 ? "s" : ""}`);
      if (parts.length === 0)           parts.push("0 jobs processed");

      const nothingNew = data.imported === 0 && data.repaired === 0;
      toast({
        title: !nothingNew ? "Import Complete" : data.duplicates > 0 ? "All Jobs Already in Inbox" : "Nothing Imported",
        description: `${data.rawCount} sent — ${parts.join(", ")}`,
        variant: !nothingNew ? "default" : "destructive",
      });
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err?.message, variant: "destructive" });
    },
  });

  // Sequential priority-first import — ranks results client-side, then sends
  // them to the existing endpoint in batches of 20, best matches first.
  const handleImportByPriority = async (limit?: number) => {
    if (liResults.length === 0 || importProgress) return;

    // Rank all results by preview score descending
    const ranked = [...liResults]
      .map((job) => ({ job, score: computePreviewScore(job, liRoles) }))
      .sort((a, b) => b.score - a.score)
      .map(({ job }) => job);

    const toImport = limit ? ranked.slice(0, limit) : ranked;
    const batchSize = 20;

    const accumulated = {
      imported: 0, duplicates: 0, failed: 0, repaired: 0,
      insufficient: 0, junk: 0, missingIds: 0, rawCount: 0,
      scanBatchLabel: "",
      skipLog: [] as { title: string; reason: string }[],
    };

    for (let start = 0; start < toImport.length; start += batchSize) {
      const batch = toImport.slice(start, Math.min(start + batchSize, toImport.length));
      const done  = start + batch.length;
      setImportProgress({ done, total: toImport.length, batchLabel: `Importing top-priority jobs ${start + 1}–${done} of ${toImport.length}` });

      // Log the first job of the first batch so we can see what's being sent
      if (start === 0 && batch.length > 0) {
        console.log("[LI Import] Sending first batch to backend:", {
          batchSize: batch.length,
          firstJob: batch[0],
        });
      }

      try {
        const r    = await apiRequest("POST", "/api/import-linkedin-jobs", { jobs: batch });
        const data = await r.json();

        // Log the full response from the backend for debugging
        if (start === 0) {
          console.log("[LI Import] Backend response (batch 1):", data);
        }

        accumulated.imported     += data.imported     ?? 0;
        accumulated.duplicates   += data.duplicates   ?? 0;
        accumulated.failed       += data.failed       ?? 0;
        accumulated.repaired     += data.repaired     ?? 0;
        accumulated.insufficient += data.insufficient ?? 0;
        accumulated.junk         += data.junk         ?? 0;
        accumulated.missingIds   += data.missingIds   ?? 0;
        accumulated.rawCount     += data.rawCount     ?? 0;
        if (data.scanBatchLabel) accumulated.scanBatchLabel = data.scanBatchLabel;
        if (Array.isArray(data.skipLog)) accumulated.skipLog.push(...data.skipLog);
      } catch (err: any) {
        toast({ title: "Batch Import Failed", description: err?.message, variant: "destructive" });
        break;
      }
    }

    setImportProgress(null);
    setLiImportSummary(accumulated);
    queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });

    // Build a detailed breakdown message regardless of outcome
    const parts: string[] = [];
    if (accumulated.imported > 0)     parts.push(`${accumulated.imported} imported`);
    if (accumulated.repaired > 0)     parts.push(`${accumulated.repaired} repaired`);
    if (accumulated.duplicates > 0)   parts.push(`${accumulated.duplicates} duplicate${accumulated.duplicates !== 1 ? "s" : ""}`);
    if (accumulated.junk > 0)         parts.push(`${accumulated.junk} invalid (junk page)`);
    if (accumulated.insufficient > 0) parts.push(`${accumulated.insufficient} missing fields`);
    if (accumulated.failed > 0)       parts.push(`${accumulated.failed} error${accumulated.failed !== 1 ? "s" : ""}`);
    if (parts.length === 0)           parts.push("0 jobs processed");

    const nothingNew = accumulated.imported === 0 && accumulated.repaired === 0;
    const allDupes   = nothingNew && accumulated.duplicates > 0 && accumulated.insufficient === 0 && accumulated.junk === 0 && accumulated.failed === 0;

    console.log("[LI Import] Final accumulated:", accumulated);

    toast({
      title: !nothingNew
        ? "Import Complete"
        : allDupes ? "All Jobs Already in Inbox" : "Nothing Imported",
      description: `${accumulated.rawCount} sent — ${parts.join(", ")}`,
      variant: !nothingNew ? "default" : "destructive",
    });
  };

  const toggleJobSelection = (idx: number) => {
    setSelectedJobIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedJobIndices.size === liResults.length) {
      setSelectedJobIndices(new Set());
    } else {
      setSelectedJobIndices(new Set(liResults.map((_, i) => i)));
    }
  };

  const { data: settings, isLoading: settingsLoading } = useQuery<DiscoverySettings>({ queryKey: ["/api/discovery/settings"] });
  const { data: status } = useQuery<{ running: boolean; latestRun: DiscoveryRun | null }>({
    queryKey: ["/api/discovery/status"],
    refetchInterval: (query) => {
      const d = query.state.data as { running: boolean } | undefined;
      return d?.running ? 3000 : false;
    },
  });
  const { data: results = [] } = useQuery<DiscoveryResult[]>({
    queryKey: ["/api/discovery/results"],
    refetchInterval: status?.running ? 5000 : false,
  });

  useEffect(() => {
    if (settings && !local) {
      setLocal(settings);
    }
  }, [settings, local]);

  const update = (partial: Partial<DiscoverySettings>) => {
    setLocal((prev) => prev ? { ...prev, ...partial } : prev);
  };

  const updateSource = (key: keyof DiscoverySettings["sources"], val: boolean) => {
    setLocal((prev) => prev ? { ...prev, sources: { ...prev.sources, [key]: val } } : prev);
  };

  const saveMutation = useMutation({
    mutationFn: (data: DiscoverySettings) => apiRequest("PUT", "/api/discovery/settings", data),
    onSuccess: () => {
      toast({ title: "Settings Saved", description: "Discovery configuration updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/settings"] });
    },
    onError: (err: any) => {
      toast({ title: "Save Failed", description: err?.message, variant: "destructive" });
    },
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/discovery/run"),
    onSuccess: () => {
      toast({ title: "Discovery Started", description: "Searching for jobs across enabled sources..." });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/results"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to Start", description: err?.message, variant: "destructive" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/discovery/stop"),
    onSuccess: () => {
      toast({ title: "Discovery Stopped" });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/status"] });
    },
  });

  const isRunning = status?.running || false;
  const latestRun = status?.latestRun;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Job Discovery</h1>
        <p className="text-muted-foreground">Automatically find jobs from public sources and send them into your inbox for review.</p>
      </div>

      <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Discovery Configuration</CardTitle>
                  <CardDescription>Set your target roles, locations, keywords, sources, and scan preferences</CardDescription>
                </div>
                {configOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {settingsLoading || !local ? (
              <CardContent className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></CardContent>
            ) : (
              <CardContent className="space-y-6 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <TagInput label="Primary Target Roles" values={local.primaryRoles} onChange={(v) => update({ primaryRoles: v })} placeholder="e.g. Data Analyst" testId="primary-roles" />
                  <TagInput label="Secondary Target Roles" values={local.secondaryRoles} onChange={(v) => update({ secondaryRoles: v })} placeholder="e.g. Data Engineer" testId="secondary-roles" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <TagInput label="Preferred Locations" values={local.preferredLocations} onChange={(v) => update({ preferredLocations: v })} placeholder="e.g. Remote, New York" testId="locations" />
                  <div className="space-y-1.5">
                    <Label className="text-sm">Work Modes</Label>
                    <div className="flex gap-4 pt-1.5">
                      {["Remote", "Hybrid", "Onsite"].map((mode) => (
                        <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={local.workModes.includes(mode)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                update({ workModes: [...local.workModes, mode] });
                              } else {
                                update({ workModes: local.workModes.filter((m) => m !== mode) });
                              }
                            }}
                            data-testid={`checkbox-workmode-${mode.toLowerCase()}`}
                            className="rounded"
                          />
                          {mode}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <TagInput label="Search Keywords" values={local.searchKeywords} onChange={(v) => update({ searchKeywords: v })} placeholder="e.g. SQL, Python" testId="keywords" />
                  <TagInput label="Exclude Keywords" values={local.excludeKeywords} onChange={(v) => update({ excludeKeywords: v })} placeholder="e.g. Senior, Director" testId="exclude-keywords" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Max Jobs Per Scan</Label>
                    <Input type="number" min={1} max={100} value={local.maxJobsPerScan} onChange={(e) => update({ maxJobsPerScan: parseInt(e.target.value) || 50 })} data-testid="input-max-jobs" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Job Age Filter</Label>
                    <Select value={local.jobAgeFilter} onValueChange={(v) => update({ jobAgeFilter: v })}>
                      <SelectTrigger data-testid="select-job-age" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Last 24 hours">Last 24 hours</SelectItem>
                        <SelectItem value="Last 3 days">Last 3 days</SelectItem>
                        <SelectItem value="Last 7 days">Last 7 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Scheduler</Label>
                    <Select value={local.scheduler} onValueChange={(v) => update({ scheduler: v })}>
                      <SelectTrigger data-testid="select-scheduler" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Manual Only">Manual Only</SelectItem>
                        <SelectItem value="Daily">Daily</SelectItem>
                        <SelectItem value="Twice Daily">Twice Daily</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Preferred Freshness</Label>
                    <Select value={local.preferredFreshness} onValueChange={(v) => update({ preferredFreshness: v })}>
                      <SelectTrigger data-testid="select-preferred-freshness" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Last 24 hours preferred, fallback to 48 hours">24h preferred, 48h fallback</SelectItem>
                        <SelectItem value="Last 24 hours only">Last 24 hours only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Daily Import Cap</Label>
                    <Select value={String(local.dailyImportCap)} onValueChange={(v) => update({ dailyImportCap: parseInt(v) })}>
                      <SelectTrigger data-testid="select-daily-import-cap" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="150">150</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Discovery Sources</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {([
                      { key: "googleJobs" as const, label: "Google Jobs", icon: Globe },
                      { key: "greenhouse" as const, label: "Greenhouse", icon: Building2 },
                      { key: "lever" as const, label: "Lever", icon: Zap },
                      { key: "workday" as const, label: "Workday", icon: Building2 },
                      { key: "companyCareerPages" as const, label: "Company Career Pages", icon: Building2 },
                      { key: "emailAlerts" as const, label: "Email Alerts", icon: Clock },
                    ]).map(({ key, label, icon: Icon }) => (
                      <div key={key} className="flex items-center justify-between p-2 rounded border">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{label}</span>
                        </div>
                        <Switch checked={local.sources[key]} onCheckedChange={(v) => updateSource(key, v)} data-testid={`switch-source-${key}`} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button onClick={() => local && saveMutation.mutate(local)} disabled={saveMutation.isPending} data-testid="button-save-settings" variant="outline">
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Discovery Settings
                  </Button>
                  {isRunning ? (
                    <Button variant="destructive" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending} data-testid="button-stop-discovery">
                      <Square className="h-4 w-4 mr-2" />Stop Discovery
                    </Button>
                  ) : (
                    <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} data-testid="button-run-discovery">
                      {runMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      Run Discovery Now
                    </Button>
                  )}
                </div>
              </CardContent>
            )}
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {isRunning && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <div>
              <p className="text-sm font-medium">Discovery in progress...</p>
              <p className="text-xs text-muted-foreground">Searching across enabled job sources. Results will appear below.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold" data-testid="stat-found">{latestRun?.jobsFound ?? 0}</div>
            <div className="text-xs text-muted-foreground">Jobs Found</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-green-600" data-testid="stat-imported">{latestRun?.jobsImported ?? 0}</div>
            <div className="text-xs text-muted-foreground">Imported</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-yellow-600" data-testid="stat-duplicates">{latestRun?.jobsDuplicate ?? 0}</div>
            <div className="text-xs text-muted-foreground">Duplicates Skipped</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-red-600" data-testid="stat-failed">{latestRun?.jobsFailed ?? 0}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-600" />
              <div className="text-2xl font-bold text-green-600" data-testid="stat-fresh-24h-imported">
                {results.filter((r) => r.freshnessLabel === "Fresh 24h" && r.importResult === "imported").length}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Fresh 24h Imported</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <div className="text-2xl font-bold text-blue-600" data-testid="stat-fresh-48h-imported">
                {results.filter((r) => r.freshnessLabel === "Fresh 48h" && r.importResult === "imported").length}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Fresh 48h Imported</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <div className="text-2xl font-bold text-orange-600" data-testid="stat-skipped-old">
                {results.filter((r) => r.importResult === "skipped_old").length}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Skipped as Too Old</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-sm font-medium" data-testid="stat-last-run">
              {latestRun?.completedAt ? new Date(latestRun.completedAt).toLocaleString() : latestRun?.startedAt ? "Running..." : "Never"}
            </div>
            <div className="text-xs text-muted-foreground">Last Run</div>
          </CardContent>
        </Card>
      </div>

      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Import Debug Log</CardTitle>
                  <CardDescription>Detailed breakdown of why jobs were duplicated or failed</CardDescription>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {results.filter(r => r.importResult === "duplicate").length} duplicates · {results.filter(r => r.importResult === "failed").length} failed
                </Badge>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4" data-testid="debug-panel">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div className="p-2 rounded bg-muted/50">
                  <div className="font-medium">{results.length}</div>
                  <div className="text-xs text-muted-foreground">Total Discovered</div>
                </div>
                <div className="p-2 rounded bg-green-50 dark:bg-green-950/30">
                  <div className="font-medium text-green-600">{results.filter(r => r.importResult === "imported").length}</div>
                  <div className="text-xs text-muted-foreground">Imported</div>
                </div>
                <div className="p-2 rounded bg-yellow-50 dark:bg-yellow-950/30">
                  <div className="font-medium text-yellow-600">{results.filter(r => r.importResult === "duplicate").length}</div>
                  <div className="text-xs text-muted-foreground">Duplicates</div>
                </div>
                <div className="p-2 rounded bg-red-50 dark:bg-red-950/30">
                  <div className="font-medium text-red-600">{results.filter(r => r.importResult === "failed").length}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
                <div className="p-2 rounded bg-orange-50 dark:bg-orange-950/30">
                  <div className="font-medium text-orange-600">{results.filter(r => r.importResult === "skipped_old").length}</div>
                  <div className="text-xs text-muted-foreground">Skipped (Old)</div>
                </div>
              </div>

              {results.filter(r => r.importResult === "duplicate").length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Duplicate Reasons</h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {(() => {
                      const reasonCounts: Record<string, number> = {};
                      results.filter(r => r.importResult === "duplicate").forEach(r => {
                        const reason = r.duplicateReason || "unknown reason";
                        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
                      });
                      return Object.entries(reasonCounts).map(([reason, count]) => (
                        <div key={reason} className="flex items-center justify-between p-2 rounded border text-sm">
                          <span className="text-yellow-700 dark:text-yellow-300">{reason}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ));
                    })()}
                  </div>
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {results.filter(r => r.importResult === "duplicate").slice(0, 20).map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-1.5 rounded bg-yellow-50 dark:bg-yellow-950/20 text-xs" data-testid={`debug-dup-${r.id}`}>
                        <span className="truncate flex-1">{r.jobTitle} at {r.jobCompany}</span>
                        <span className="text-yellow-600 dark:text-yellow-400 shrink-0 ml-2">{r.duplicateReason || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.filter(r => r.importResult === "failed").length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Failure Reasons</h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {results.filter(r => r.importResult === "failed").slice(0, 20).map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-1.5 rounded bg-red-50 dark:bg-red-950/20 text-xs" data-testid={`debug-fail-${r.id}`}>
                        <span className="truncate flex-1">{r.jobTitle || "Unknown"} at {r.jobCompany || "Unknown"}</span>
                        <span className="text-destructive shrink-0 ml-2 max-w-[200px] truncate">{r.errorMessage || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discovery History</CardTitle>
          <CardDescription>{results.length > 0 ? `${results.length} results from recent discovery runs` : "No results yet"}</CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No discovery results yet. Configure your settings above and click Run Discovery Now.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Job Title</th>
                    <th className="pb-2 font-medium">Company</th>
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 font-medium">Match Score</th>
                    <th className="pb-2 font-medium">Apply Score</th>
                    <th className="pb-2 font-medium">Apply Priority</th>
                    <th className="pb-2 font-medium">Freshness</th>
                    <th className="pb-2 font-medium">Posted Age</th>
                    <th className="pb-2 font-medium">Date Found</th>
                    <th className="pb-2 font-medium">Result</th>
                    <th className="pb-2 font-medium">Duplicate</th>
                    <th className="pb-2 font-medium">Classification</th>
                    <th className="pb-2 font-medium">Resume</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`result-row-${r.id}`}>
                      <td className="py-2 pr-2 max-w-[200px] truncate">{r.jobTitle || "—"}</td>
                      <td className="py-2 pr-2">{r.jobCompany || "—"}</td>
                      <td className="py-2 pr-2"><Badge variant="outline">{r.source || "—"}</Badge></td>
                      <td className="py-2 pr-2">
                        {r.matchScore ? (
                          <Badge
                            data-testid={`match-score-${r.id}`}
                            variant={r.matchScore === "Strong Match" ? "default" : r.matchScore === "Possible Match" ? "secondary" : "outline"}
                          >
                            {r.matchScore === "Strong Match" ? "Strong" : r.matchScore === "Possible Match" ? "Possible" : "Weak"}
                          </Badge>
                        ) : "—"}
                      </td>
                      <td className="py-2 pr-2" data-testid={`apply-score-${r.id}`}>
                        {r.applyPriorityScore > 0 ? (
                          <span className="text-sm font-medium">{r.applyPriorityScore}</span>
                        ) : "—"}
                      </td>
                      <td className="py-2 pr-2" data-testid={`apply-priority-${r.id}`}>
                        {r.applyPriorityLabel ? (
                          <Badge
                            variant={r.applyPriorityLabel === "Apply Immediately" ? "default" : r.applyPriorityLabel === "High Priority" ? "default" : r.applyPriorityLabel === "Medium Priority" ? "secondary" : "outline"}
                          >
                            {r.applyPriorityLabel}
                          </Badge>
                        ) : "—"}
                      </td>
                      <td className="py-2 pr-2" data-testid={`freshness-${r.id}`}>
                        {r.freshnessLabel ? (
                          <Badge
                            variant={r.freshnessLabel === "Fresh 24h" ? "default" : r.freshnessLabel === "Fresh 48h" ? "secondary" : "outline"}
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            {r.freshnessLabel}
                          </Badge>
                        ) : "—"}
                      </td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground" data-testid={`posted-age-${r.id}`}>
                        {(() => {
                          if (!r.createdAt) return "—";
                          const hoursAgo = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60));
                          if (hoursAgo < 1) return "Just now";
                          if (hoursAgo < 24) return `${hoursAgo}h ago`;
                          const daysAgo = Math.floor(hoursAgo / 24);
                          return `${daysAgo}d ago`;
                        })()}
                      </td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                      <td className="py-2 pr-2"><ResultsBadge result={r.importResult} /></td>
                      <td className="py-2 pr-2">
                        {r.isDuplicate ? (
                          <div>
                            <Badge variant="secondary">Yes</Badge>
                            {r.duplicateReason && <span className="text-xs text-yellow-600 dark:text-yellow-400 ml-1">{r.duplicateReason}</span>}
                          </div>
                        ) : <span className="text-muted-foreground">No</span>}
                      </td>
                      <td className="py-2 pr-2">{r.classification || "—"}</td>
                      <td className="py-2 pr-2 max-w-[150px] truncate">{r.recommendedResume || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LinkedIn Search */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SiLinkedin className="h-5 w-5 text-[#0A66C2]" />
            <div>
              <CardTitle className="text-base">LinkedIn Search</CardTitle>
              <CardDescription>Search LinkedIn for jobs posted in the last 24 hours via Apify. Results are displayed only — nothing is saved automatically.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="li-token" className="text-sm">Apify API Token</Label>
              <Input
                id="li-token"
                type="password"
                placeholder="apify_api_xxxxxxxxxxxx"
                value={apifyToken}
                onChange={(e) => setApifyToken(e.target.value)}
                data-testid="input-apify-token"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="li-roles" className="text-sm">Job Roles (comma separated)</Label>
              <Input
                id="li-roles"
                placeholder="Data Analyst, Business Analyst"
                value={liRoles}
                onChange={(e) => setLiRoles(e.target.value)}
                data-testid="input-li-roles"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="li-location" className="text-sm">Location</Label>
              <Input
                id="li-location"
                placeholder="United States"
                value={liLocation}
                onChange={(e) => setLiLocation(e.target.value)}
                data-testid="input-li-location"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => liSearchMutation.mutate()}
              disabled={liSearchMutation.isPending || !apifyToken.trim() || !liRoles.trim()}
              data-testid="button-search-linkedin"
            >
              {liSearchMutation.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Search className="h-4 w-4 mr-2" />}
              Search LinkedIn Jobs
            </Button>

            {liResults.length > 0 && !liSearchMutation.isPending && (
              <>
                {/* Manual selection import */}
                <Button
                  variant="outline"
                  onClick={() => {
                    const jobs = Array.from(selectedJobIndices).map((i) => liResults[i]);
                    if (jobs.length === 0) return;
                    liImportMutation.mutate(jobs);
                  }}
                  disabled={liImportMutation.isPending || !!importProgress || selectedJobIndices.size === 0}
                  data-testid="button-import-selected"
                >
                  {liImportMutation.isPending
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Import Selected ({selectedJobIndices.size})
                </Button>

                {/* Priority-first batch import buttons */}
                <Button
                  onClick={() => handleImportByPriority(20)}
                  disabled={liImportMutation.isPending || !!importProgress}
                  data-testid="button-import-top-20"
                >
                  {importProgress
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <Zap className="h-4 w-4 mr-2" />}
                  Import Top 20
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleImportByPriority(50)}
                  disabled={liImportMutation.isPending || !!importProgress}
                  data-testid="button-import-top-50"
                >
                  {importProgress
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Import Top 50
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleImportByPriority()}
                  disabled={liImportMutation.isPending || !!importProgress}
                  data-testid="button-import-all-priority"
                >
                  {importProgress
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Import All by Priority ({liResults.length})
                </Button>

                <span className="text-sm text-muted-foreground" data-testid="li-result-count">
                  {liResults.length} result{liResults.length !== 1 ? "s" : ""} found
                </span>
              </>
            )}
          </div>

          {liSearchMutation.isPending && (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching LinkedIn via Apify — this may take 30–90 seconds…
            </div>
          )}

          {importProgress && (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground" data-testid="li-import-progress">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{importProgress.batchLabel} — highest-priority jobs import first</span>
              <span className="text-xs text-muted-foreground/70">({Math.round((importProgress.done / importProgress.total) * 100)}%)</span>
            </div>
          )}
          {!importProgress && liImportMutation.isPending && (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing jobs and running ATS scoring…
            </div>
          )}

          {liError && !liSearchMutation.isPending && (
            <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" data-testid="li-error-message">
              {liError}
            </div>
          )}

          {liDebug && (
            <div className="rounded border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-xs space-y-1" data-testid="li-debug-panel">
              <p className="font-semibold text-blue-800 dark:text-blue-300 text-sm">Debug Info</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-blue-900 dark:text-blue-200">
                <span className="font-medium">Actor ID:</span>
                <span className="font-mono">{liDebug.actorId}</span>
                <span className="font-medium">Roles sent:</span>
                <span>{liDebug.rolesSent.join(", ")}</span>
                <span className="font-medium">Location sent:</span>
                <span>{liDebug.locationSent}</span>
                <span className="font-medium">Run ID:</span>
                <span className="font-mono break-all">{liDebug.runId || "—"}</span>
                <span className="font-medium">Dataset ID:</span>
                <span className="font-mono break-all">{liDebug.datasetId || "—"}</span>
                <span className="font-medium">Dataset items:</span>
                <span className={liDebug.rawItemCount === 0 ? "text-red-600 font-semibold" : "text-green-700 font-semibold"}>
                  {liDebug.rawItemCount}
                </span>
                <span className="font-medium">Run status:</span>
                <span>{liDebug.status}</span>
              </div>
              {liDebug.error && (
                <div className="mt-1 pt-1 border-t border-blue-200 dark:border-blue-700">
                  <span className="font-medium text-red-600">Error: </span>
                  <span className="text-red-600">{liDebug.error}</span>
                </div>
              )}
              <div className="mt-1 pt-1 border-t border-blue-200 dark:border-blue-700">
                <p className="font-medium text-blue-800 dark:text-blue-300 mb-0.5">Payload sent:</p>
                <pre className="bg-blue-100 dark:bg-blue-900/40 rounded p-1 text-xs overflow-x-auto">{JSON.stringify(liDebug.payloadSent, null, 2)}</pre>
              </div>
              <div className="mt-1 pt-1 border-t border-blue-200 dark:border-blue-700">
                <p className="font-medium text-amber-700 dark:text-amber-400 mb-0.5">
                  Raw Apify item #1 — actual field names &amp; values from actor:
                </p>
                {liDebug.rawSampleItem ? (
                  <pre className="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-600 rounded p-2 text-xs overflow-x-auto max-h-64 whitespace-pre">
                    {JSON.stringify(liDebug.rawSampleItem, null, 2)}
                  </pre>
                ) : (
                  <p className="text-red-600 dark:text-red-400 text-xs italic">rawSampleItem missing from API response</p>
                )}
              </div>
              <div className="mt-1 pt-1 border-t border-blue-200 dark:border-blue-700">
                <p className="font-medium text-green-700 dark:text-green-400 mb-0.5">
                  What our parser extracted from item #1:
                </p>
                {liDebug.parsedSampleItem ? (
                  <pre className="bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-600 rounded p-2 text-xs overflow-x-auto whitespace-pre">
                    {JSON.stringify(liDebug.parsedSampleItem, null, 2)}
                  </pre>
                ) : (
                  <p className="text-red-600 dark:text-red-400 text-xs italic">parsedSampleItem missing from API response</p>
                )}
              </div>
            </div>
          )}

          {liImportSummary && (
            <div className="space-y-2" data-testid="li-import-summary">
              <div className="rounded border bg-muted/50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium">Last import:</span>
                  <span className="text-muted-foreground">{liImportSummary.rawCount} sent</span>
                  <span className={liImportSummary.imported > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                    ✓ {liImportSummary.imported} inserted
                  </span>
                  {(liImportSummary.repaired ?? 0) > 0 && (
                    <span className="text-blue-600 font-medium">⟳ {liImportSummary.repaired} repaired</span>
                  )}
                  {liImportSummary.duplicates > 0 && (
                    <span className="text-yellow-600">⊘ {liImportSummary.duplicates} duplicate{liImportSummary.duplicates !== 1 ? "s" : ""}</span>
                  )}
                  {(liImportSummary.junk ?? 0) > 0 && (
                    <span className="text-orange-600">⊘ {liImportSummary.junk} invalid (junk page)</span>
                  )}
                  {(liImportSummary.insufficient ?? 0) > 0 && (
                    <span className="text-muted-foreground">⊘ {liImportSummary.insufficient} missing fields</span>
                  )}
                  {liImportSummary.failed > 0 && (
                    <span className="text-destructive">✕ {liImportSummary.failed} error{liImportSummary.failed !== 1 ? "s" : ""}</span>
                  )}
                </div>
                {liImportSummary.scanBatchLabel && (
                  <div className="text-xs text-muted-foreground mt-1">{liImportSummary.scanBatchLabel}</div>
                )}
              </div>

              {/* Nothing new but clear reason breakdown */}
              {liImportSummary.imported === 0 && (liImportSummary.repaired ?? 0) === 0 && (
                <div className="rounded border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-300" data-testid="li-nothing-imported-reason">
                  <p className="font-medium mb-1">No new jobs imported — reasons:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    {liImportSummary.duplicates > 0 && <li>{liImportSummary.duplicates} already exist in your inbox (duplicate detection)</li>}
                    {(liImportSummary.junk ?? 0) > 0 && <li>{liImportSummary.junk} skipped — invalid page (login/portal redirect)</li>}
                    {(liImportSummary.insufficient ?? 0) > 0 && <li>{liImportSummary.insufficient} skipped — missing title and URL fields</li>}
                    {liImportSummary.failed > 0 && <li>{liImportSummary.failed} failed due to server error</li>}
                    {liImportSummary.duplicates === 0 && (liImportSummary.junk ?? 0) === 0 && (liImportSummary.insufficient ?? 0) === 0 && liImportSummary.failed === 0 && (
                      <li>No jobs were received by the server (check console for details)</li>
                    )}
                  </ul>
                  {(liImportSummary.skipLog ?? []).length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium">Skip details ({liImportSummary.skipLog!.length})</summary>
                      <ul className="mt-1 space-y-0.5 font-mono text-[10px] max-h-32 overflow-y-auto">
                        {liImportSummary.skipLog!.map((s, i) => (
                          <li key={i}>{s.title} → {s.reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {liResults.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-2 w-8">
                      <input
                        type="checkbox"
                        checked={liResults.length > 0 && selectedJobIndices.size === liResults.length}
                        onChange={toggleSelectAll}
                        data-testid="checkbox-select-all-li"
                        className="rounded"
                        title="Select all"
                      />
                    </th>
                    <th className="pb-2 pr-3 font-medium">Priority</th>
                    <th className="pb-2 pr-3 font-medium">Job Title</th>
                    <th className="pb-2 pr-3 font-medium">Company</th>
                    <th className="pb-2 pr-3 font-medium">Location</th>
                    <th className="pb-2 pr-3 font-medium">Date Posted</th>
                    <th className="pb-2 pr-3 font-medium">Source</th>
                    <th className="pb-2 font-medium">Apply Link</th>
                  </tr>
                </thead>
                <tbody>
                  {[...liResults]
                    .map((job, origIdx) => ({ job, origIdx, score: computePreviewScore(job, liRoles) }))
                    .sort((a, b) => b.score - a.score)
                    .map(({ job, origIdx, score }, rank) => {
                      const tier = getPriorityTier(score);
                      return (
                        <tr
                          key={origIdx}
                          className={`border-b last:border-0 hover:bg-muted/50 cursor-pointer ${selectedJobIndices.has(origIdx) ? "bg-primary/5" : ""}`}
                          onClick={() => toggleJobSelection(origIdx)}
                          data-testid={`li-result-row-${rank}`}
                        >
                          <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedJobIndices.has(origIdx)}
                              onChange={() => toggleJobSelection(origIdx)}
                              data-testid={`checkbox-li-job-${origIdx}`}
                              className="rounded"
                            />
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${tier.className}`} data-testid={`li-tier-${rank}`}>
                              {tier.label}
                            </span>
                          </td>
                          <td className="py-2 pr-3 max-w-[200px]">
                            <span className="font-medium truncate block" data-testid={`li-title-${rank}`}>{job.title || "—"}</span>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground" data-testid={`li-company-${rank}`}>{job.company || "—"}</td>
                          <td className="py-2 pr-3 text-muted-foreground max-w-[150px] truncate" data-testid={`li-location-${rank}`}>{job.location || "—"}</td>
                          <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap" data-testid={`li-date-${rank}`}>{job.datePosted || "—"}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className="text-[#0A66C2] border-[#0A66C2]/30">
                              <SiLinkedin className="h-3 w-3 mr-1" />
                              {job.source || "LinkedIn"}
                            </Badge>
                          </td>
                          <td className="py-2" onClick={(e) => e.stopPropagation()}>
                            {job.applyLink ? (
                              <a
                                href={job.applyLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                                data-testid={`li-apply-${rank}`}
                              >
                                Apply <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <CardContent className="py-3 px-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Safety Notice</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            This feature collects and organizes job listings only. It does not auto-submit applications, bypass login systems, or circumvent any access controls. All discovered jobs go to your inbox for human review before any action is taken.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
