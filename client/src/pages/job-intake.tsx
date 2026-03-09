import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link2, Mail, List, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, ExternalLink, LinkIcon, Copy } from "lucide-react";
import type { ImportLog, Job } from "@shared/schema";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <Badge variant="default" className="bg-green-600" data-testid={`badge-status-${status}`}><CheckCircle2 className="h-3 w-3 mr-1" />Imported</Badge>;
    case "failed":
      return <Badge variant="destructive" data-testid={`badge-status-${status}`}><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case "duplicate":
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}><AlertTriangle className="h-3 w-3 mr-1" />Duplicate</Badge>;
    default:
      return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  switch (sourceType) {
    case "url":
      return <Badge variant="outline"><Link2 className="h-3 w-3 mr-1" />URL</Badge>;
    case "email":
      return <Badge variant="outline"><Mail className="h-3 w-3 mr-1" />Email</Badge>;
    case "bulk":
      return <Badge variant="outline"><List className="h-3 w-3 mr-1" />Bulk</Badge>;
    case "bulk-urls":
      return <Badge variant="outline"><LinkIcon className="h-3 w-3 mr-1" />Bulk URLs</Badge>;
    default:
      return <Badge variant="outline">{sourceType}</Badge>;
  }
}

function DuplicateInfo({ reason, existingJob }: { reason?: string; existingJob?: Job }) {
  if (!reason && !existingJob) return null;
  return (
    <div className="p-3 rounded border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 text-sm space-y-1" data-testid="duplicate-info">
      {reason && <p className="text-yellow-700 dark:text-yellow-300 font-medium">Reason: {reason}</p>}
      {existingJob && (
        <div className="text-muted-foreground">
          <p>Existing: <span className="font-medium">{existingJob.title}</span> at {existingJob.company}</p>
          <p className="text-xs">Status: {existingJob.status} · Score: {existingJob.applyPriorityScore}</p>
        </div>
      )}
    </div>
  );
}

function PasteUrlTab({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl || "");
  const { toast } = useToast();
  const autoImported = useRef(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ reason?: string; existingJob?: Job } | null>(null);

  const mutation = useMutation({
    mutationFn: async (importUrl: string) => {
      const res = await fetch("/api/intake/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err: any = new Error(data.message || "Import failed");
        err.duplicate = data.duplicate;
        err.duplicateReason = data.duplicateReason;
        err.existingJob = data.existingJob;
        throw err;
      }
      return data;
    },
    onSuccess: (data: any) => {
      toast({ title: "Job Imported", description: `${data.job?.title || "Job"} at ${data.job?.company || "Company"} added to Jobs Inbox` });
      setUrl("");
      setDuplicateInfo(null);
      queryClient.invalidateQueries({ queryKey: ["/api/intake/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to import job";
      if (err?.duplicate) {
        setDuplicateInfo({ reason: err.duplicateReason, existingJob: err.existingJob });
        toast({ title: "Duplicate Job", description: msg });
      } else {
        setDuplicateInfo(null);
        toast({ title: "Import Failed", description: msg, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/intake/history"] });
    },
  });

  useEffect(() => {
    if (initialUrl && !autoImported.current) {
      autoImported.current = true;
      mutation.mutate(initialUrl);
    }
  }, [initialUrl]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />Paste Job Link</CardTitle>
        <CardDescription>Paste a job URL from any company career page, LinkedIn, Indeed, Greenhouse, Lever, or other job boards. We'll extract the details automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="https://jobs.lever.co/company/position..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            data-testid="input-job-url"
            className="flex-1"
          />
          <Button
            onClick={() => { setDuplicateInfo(null); mutation.mutate(url); }}
            disabled={!url.trim() || mutation.isPending}
            data-testid="button-import-url"
          >
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</> : "Import Job"}
          </Button>
        </div>
        {duplicateInfo && <DuplicateInfo reason={duplicateInfo.reason} existingJob={duplicateInfo.existingJob} />}
        <p className="text-xs text-muted-foreground">Supported: LinkedIn, Indeed, Glassdoor, Lever, Greenhouse, Workday, iCIMS, SmartRecruiters, and most company career pages</p>
      </CardContent>
    </Card>
  );
}

function BulkUrlTab() {
  const [urls, setUrls] = useState("");
  const { toast } = useToast();
  const [results, setResults] = useState<Array<{ url: string; title: string; company: string; status: string; jobId?: number; error?: string; duplicateReason?: string; existingJobId?: number; importedAt?: string; verifiedInDb?: boolean }> | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const urlCount = urls.split("\n").filter(u => u.trim().startsWith("http")).length;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/intake/bulk-urls", { urls });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Bulk Import Complete", description: data.message });
      setResults(data.results);
      setUrls("");
      setProcessing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/intake/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err?.message || "Failed to process URLs", variant: "destructive" });
      setProcessing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/intake/history"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><LinkIcon className="h-5 w-5" />Bulk URL Import</CardTitle>
        <CardDescription>Paste 20-200 job URLs, one per line. Each URL will be scraped and imported with duplicate detection.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder={"Paste job URLs (one per line):\nhttps://jobs.lever.co/company/position-1\nhttps://boards.greenhouse.io/company/jobs/123456\nhttps://linkedin.com/jobs/view/789\nhttps://company.com/careers/data-analyst\n..."}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={10}
          data-testid="input-bulk-urls"
        />
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{urlCount} URL{urlCount !== 1 ? "s" : ""} detected</p>
          <Button
            onClick={() => { setProcessing(true); mutation.mutate(); }}
            disabled={urlCount === 0 || mutation.isPending}
            data-testid="button-import-bulk-urls"
          >
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing {urlCount} URLs...</> : `Import ${urlCount} URLs`}
          </Button>
        </div>

        {results && results.length > 0 && (
          <div className="space-y-2 mt-4" data-testid="bulk-url-import-results">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Import Results</h4>
              <div className="flex gap-2 text-xs items-center">
                <Badge variant="default" className="bg-green-600">{results.filter(r => r.status === "success").length} imported</Badge>
                <Badge variant="secondary">{results.filter(r => r.status === "duplicate").length} duplicates</Badge>
                <Badge variant="destructive">{results.filter(r => r.status === "failed").length} failed</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setShowDebug(!showDebug)}
                  data-testid="button-toggle-debug"
                >
                  {showDebug ? "Hide Debug" : "Show Debug"}
                </Button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-1">
              {results.map((r, i) => (
                <div key={i} className="p-2 rounded border text-sm" data-testid={`bulk-url-result-${i}`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium truncate block">{r.title || r.url}</span>
                      {r.company && <span className="text-muted-foreground text-xs">{r.company}</span>}
                      {r.duplicateReason && <span className="text-yellow-600 dark:text-yellow-400 text-xs block">{r.duplicateReason}</span>}
                      {r.error && <span className="text-destructive text-xs block">{r.error}</span>}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  {showDebug && (
                    <div className="mt-1 pt-1 border-t text-xs text-muted-foreground space-y-0.5" data-testid={`debug-panel-${i}`}>
                      <div className="flex gap-4">
                        <span>Job ID: <strong data-testid={`debug-job-id-${i}`}>{r.jobId ?? "N/A"}</strong></span>
                        <span>Status: <strong data-testid={`debug-status-${i}`}>{r.status}</strong></span>
                      </div>
                      <div className="flex gap-4">
                        <span>Imported: <strong data-testid={`debug-imported-at-${i}`}>{r.importedAt ? new Date(r.importedAt).toLocaleString() : "N/A"}</strong></span>
                        <span>In Inbox: <strong data-testid={`debug-in-inbox-${i}`} className={r.verifiedInDb ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>{r.verifiedInDb ? "Yes (verified)" : "No"}</strong></span>
                      </div>
                      {r.existingJobId && <span>Existing Job ID: <strong>{r.existingJobId}</strong></span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmailAlertTab() {
  const [emailContent, setEmailContent] = useState("");
  const { toast } = useToast();
  const [results, setResults] = useState<Array<{ title: string; company: string; status: string; error?: string; duplicateReason?: string }> | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/intake/email", { emailContent });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Email Processed", description: data.message });
      setResults(data.results);
      setEmailContent("");
      queryClient.invalidateQueries({ queryKey: ["/api/intake/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (err: any) => {
      toast({ title: "Parse Failed", description: err?.message || "Failed to parse email", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/intake/history"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Email Alert Import</CardTitle>
        <CardDescription>Paste the full text of a job alert email. We'll extract all job listings and add them to your inbox.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder={"Paste your job alert email content here...\n\nExample format:\n• Data Analyst at Google - Mountain View, CA\n• Healthcare Analyst at UnitedHealth - Remote\n• Business Analyst at Deloitte - Chicago, IL"}
          value={emailContent}
          onChange={(e) => setEmailContent(e.target.value)}
          rows={8}
          data-testid="input-email-content"
        />
        <Button
          onClick={() => mutation.mutate()}
          disabled={!emailContent.trim() || mutation.isPending}
          data-testid="button-import-email"
        >
          {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</> : "Parse & Import Jobs"}
        </Button>

        {results && results.length > 0 && (
          <div className="space-y-2 mt-4" data-testid="email-import-results">
            <h4 className="text-sm font-medium">Import Results</h4>
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded border text-sm">
                <div>
                  <span className="font-medium">{r.title || "Unknown"}</span>
                  {r.company && <span className="text-muted-foreground"> at {r.company}</span>}
                  {r.duplicateReason && <span className="text-yellow-600 dark:text-yellow-400 text-xs block">{r.duplicateReason}</span>}
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BulkPasteTab() {
  const [content, setContent] = useState("");
  const { toast } = useToast();
  const [results, setResults] = useState<Array<{ title: string; company: string; status: string; error?: string; duplicateReason?: string }> | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/intake/bulk", { content });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Bulk Import Complete", description: data.message });
      setResults(data.results);
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["/api/intake/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err?.message || "Failed to process", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/intake/history"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><List className="h-5 w-5" />Bulk Paste Import</CardTitle>
        <CardDescription>Paste multiple job descriptions separated by blank lines.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder={"Paste job descriptions separated by blank lines:\n\nData Analyst at Google\nMountain View, CA\nAnalyze data trends...\n\nHealthcare Analyst at UnitedHealth\nRemote\nSupport clinical operations..."}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          data-testid="input-bulk-content"
        />
        <Button
          onClick={() => mutation.mutate()}
          disabled={!content.trim() || mutation.isPending}
          data-testid="button-import-bulk"
        >
          {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</> : "Import All Jobs"}
        </Button>

        {results && results.length > 0 && (
          <div className="space-y-2 mt-4" data-testid="bulk-import-results">
            <h4 className="text-sm font-medium">Import Results</h4>
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded border text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium truncate block">{r.title || "Unknown"}</span>
                  {r.company && <span className="text-muted-foreground text-xs">{r.company}</span>}
                  {r.duplicateReason && <span className="text-yellow-600 dark:text-yellow-400 text-xs block">{r.duplicateReason}</span>}
                  {r.error && <span className="text-destructive text-xs block">{r.error}</span>}
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function JobIntake() {
  const searchString = useSearch();
  const queryUrl = new URLSearchParams(searchString).get("url") || "";

  const { data: history = [], isLoading } = useQuery<ImportLog[]>({
    queryKey: ["/api/intake/history"],
  });

  const recentImports = history.filter((h) => h.status === "success").slice(0, 10);
  const failedImports = history.filter((h) => h.status === "failed").slice(0, 10);
  const duplicateImports = history.filter((h) => h.status === "duplicate").slice(0, 10);

  const stats = {
    total: history.length,
    success: history.filter((h) => h.status === "success").length,
    failed: history.filter((h) => h.status === "failed").length,
    duplicates: history.filter((h) => h.status === "duplicate").length,
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Job Intake</h1>
        <p className="text-muted-foreground">Import jobs from links, email alerts, or bulk paste. Jobs are auto-classified and added to your inbox for review.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Imports</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-green-600" data-testid="stat-success">{stats.success}</div>
            <div className="text-xs text-muted-foreground">Imported</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-red-600" data-testid="stat-failed">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-2xl font-bold text-yellow-600" data-testid="stat-duplicates">{stats.duplicates}</div>
            <div className="text-xs text-muted-foreground">Duplicates</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={queryUrl ? "url" : "url"}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="url" data-testid="tab-url"><Link2 className="h-4 w-4 mr-1" />Paste Link</TabsTrigger>
          <TabsTrigger value="bulk-urls" data-testid="tab-bulk-urls"><LinkIcon className="h-4 w-4 mr-1" />Bulk URLs</TabsTrigger>
          <TabsTrigger value="email" data-testid="tab-email"><Mail className="h-4 w-4 mr-1" />Email Alert</TabsTrigger>
          <TabsTrigger value="bulk" data-testid="tab-bulk"><List className="h-4 w-4 mr-1" />Bulk Paste</TabsTrigger>
        </TabsList>
        <TabsContent value="url"><PasteUrlTab initialUrl={queryUrl} /></TabsContent>
        <TabsContent value="bulk-urls"><BulkUrlTab /></TabsContent>
        <TabsContent value="email"><EmailAlertTab /></TabsContent>
        <TabsContent value="bulk"><BulkPasteTab /></TabsContent>
      </Tabs>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Import History</h2>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : history.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No imports yet. Use the tabs above to import your first jobs.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="recent">
            <TabsList>
              <TabsTrigger value="recent" data-testid="tab-recent">Recently Imported ({stats.success})</TabsTrigger>
              <TabsTrigger value="failed" data-testid="tab-failed">Failed ({stats.failed})</TabsTrigger>
              <TabsTrigger value="duplicates" data-testid="tab-duplicates">Duplicates ({stats.duplicates})</TabsTrigger>
            </TabsList>
            <TabsContent value="recent">
              <div className="space-y-1">
                {recentImports.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No successful imports yet</p>
                ) : (
                  recentImports.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded border text-sm" data-testid={`import-log-${log.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{log.jobTitle || "Unknown"}</div>
                        <div className="text-muted-foreground text-xs">{log.jobCompany}{log.sourceUrl && <> · <a href={log.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-0.5">Source <ExternalLink className="h-3 w-3" /></a></>}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <SourceBadge sourceType={log.sourceType} />
                        <StatusBadge status={log.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
            <TabsContent value="failed">
              <div className="space-y-1">
                {failedImports.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No failed imports</p>
                ) : (
                  failedImports.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded border text-sm" data-testid={`import-log-${log.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{log.jobTitle || log.sourceUrl || "Unknown"}</div>
                        <div className="text-destructive text-xs">{log.errorMessage}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <SourceBadge sourceType={log.sourceType} />
                        <StatusBadge status={log.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
            <TabsContent value="duplicates">
              <div className="space-y-1">
                {duplicateImports.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No duplicate imports</p>
                ) : (
                  duplicateImports.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded border text-sm" data-testid={`import-log-${log.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{log.jobTitle || "Unknown"}</div>
                        <div className="text-muted-foreground text-xs">
                          {log.jobCompany}
                          {log.duplicateReason && <span className="text-yellow-600 dark:text-yellow-400"> · {log.duplicateReason}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <SourceBadge sourceType={log.sourceType} />
                        <StatusBadge status={log.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
