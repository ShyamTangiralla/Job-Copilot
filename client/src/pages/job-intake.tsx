import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link2, Mail, List, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock, ExternalLink } from "lucide-react";
import type { ImportLog } from "@shared/schema";

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
    default:
      return <Badge variant="outline">{sourceType}</Badge>;
  }
}

function PasteUrlTab() {
  const [url, setUrl] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/intake/url", { url }),
    onSuccess: (data: any) => {
      toast({ title: "Job Imported", description: `${data.job.title} at ${data.job.company} added to Jobs Inbox` });
      setUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/intake/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to import job";
      toast({ title: msg.includes("duplicate") ? "Duplicate Job" : "Import Failed", description: msg, variant: msg.includes("duplicate") ? "default" : "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/intake/history"] });
    },
  });

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
            onClick={() => mutation.mutate()}
            disabled={!url.trim() || mutation.isPending}
            data-testid="button-import-url"
          >
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</> : "Import Job"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Supported: LinkedIn, Indeed, Glassdoor, Lever, Greenhouse, Workday, iCIMS, SmartRecruiters, and most company career pages</p>
      </CardContent>
    </Card>
  );
}

function EmailAlertTab() {
  const [emailContent, setEmailContent] = useState("");
  const { toast } = useToast();
  const [results, setResults] = useState<Array<{ title: string; company: string; status: string; error?: string }> | null>(null);

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/intake/email", { emailContent }),
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
  const [results, setResults] = useState<Array<{ title: string; company: string; status: string; error?: string }> | null>(null);

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/intake/bulk", { content }),
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
        <CardDescription>Paste multiple job links (one per line) or multiple job descriptions separated by blank lines.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder={"Paste multiple job URLs (one per line):\nhttps://linkedin.com/jobs/view/123\nhttps://jobs.lever.co/company/456\nhttps://company.com/careers/position\n\nOr paste job descriptions separated by blank lines:\nData Analyst at Google\nMountain View, CA\nAnalyze data trends...\n\nHealthcare Analyst at UnitedHealth\nRemote\nSupport clinical operations..."}
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

      <Tabs defaultValue="url">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="url" data-testid="tab-url"><Link2 className="h-4 w-4 mr-1" />Paste Link</TabsTrigger>
          <TabsTrigger value="email" data-testid="tab-email"><Mail className="h-4 w-4 mr-1" />Email Alert</TabsTrigger>
          <TabsTrigger value="bulk" data-testid="tab-bulk"><List className="h-4 w-4 mr-1" />Bulk Paste</TabsTrigger>
        </TabsList>
        <TabsContent value="url"><PasteUrlTab /></TabsContent>
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
                        <div className="text-muted-foreground text-xs">{log.jobCompany}</div>
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
