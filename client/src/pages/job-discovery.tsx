import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, Square, Save, Search, CheckCircle2, XCircle, AlertTriangle, Clock, Globe, Building2, Zap, RefreshCw } from "lucide-react";
import type { DiscoveryResult, DiscoveryRun } from "@shared/schema";

interface DiscoverySettings {
  primaryRoles: string[];
  secondaryRoles: string[];
  preferredLocations: string[];
  workModes: string[];
  maxJobsPerScan: number;
  searchKeywords: string[];
  excludeKeywords: string[];
  jobAgeFilter: string;
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
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder={placeholder}
          data-testid={`input-${testId}`}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} data-testid={`button-add-${testId}`}>Add</Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="cursor-pointer" onClick={() => removeTag(v)} data-testid={`tag-${testId}-${v}`}>
            {v} <XCircle className="h-3 w-3 ml-1" />
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, onSave }: { settings: DiscoverySettings; onSave: (s: DiscoverySettings) => void }) {
  const [local, setLocal] = useState<DiscoverySettings>(settings);

  const update = (partial: Partial<DiscoverySettings>) => {
    setLocal((prev) => ({ ...prev, ...partial }));
  };

  const updateSource = (key: keyof DiscoverySettings["sources"], val: boolean) => {
    setLocal((prev) => ({ ...prev, sources: { ...prev.sources, [key]: val } }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Target Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TagInput label="Primary Target Roles" values={local.primaryRoles} onChange={(v) => update({ primaryRoles: v })} placeholder="e.g. Data Analyst" testId="primary-roles" />
          <TagInput label="Secondary Target Roles" values={local.secondaryRoles} onChange={(v) => update({ secondaryRoles: v })} placeholder="e.g. Data Engineer" testId="secondary-roles" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TagInput label="Preferred Locations" values={local.preferredLocations} onChange={(v) => update({ preferredLocations: v })} placeholder="e.g. Remote, New York" testId="locations" />

          <div className="space-y-2">
            <Label>Work Modes</Label>
            <div className="flex gap-3">
              {["Remote", "Hybrid", "Onsite"].map((mode) => (
                <label key={mode} className="flex items-center gap-2 text-sm">
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
                  />
                  {mode}
                </label>
              ))}
            </div>
          </div>

          <TagInput label="Search Keywords" values={local.searchKeywords} onChange={(v) => update({ searchKeywords: v })} placeholder="e.g. SQL, Python" testId="keywords" />
          <TagInput label="Exclude Keywords" values={local.excludeKeywords} onChange={(v) => update({ excludeKeywords: v })} placeholder="e.g. Senior, Director" testId="exclude-keywords" />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Jobs Per Scan</Label>
              <Input type="number" min={1} max={100} value={local.maxJobsPerScan} onChange={(e) => update({ maxJobsPerScan: parseInt(e.target.value) || 25 })} data-testid="input-max-jobs" />
            </div>
            <div className="space-y-2">
              <Label>Job Age Filter</Label>
              <Select value={local.jobAgeFilter} onValueChange={(v) => update({ jobAgeFilter: v })}>
                <SelectTrigger data-testid="select-job-age">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Last 24 hours">Last 24 hours</SelectItem>
                  <SelectItem value="Last 3 days">Last 3 days</SelectItem>
                  <SelectItem value="Last 7 days">Last 7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sources</CardTitle>
          <CardDescription>Toggle which job sources to search</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{label}</span>
              </div>
              <Switch checked={local.sources[key]} onCheckedChange={(v) => updateSource(key, v)} data-testid={`switch-source-${key}`} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduler</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={local.scheduler} onValueChange={(v) => update({ scheduler: v })}>
            <SelectTrigger data-testid="select-scheduler">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Manual Only">Manual Only</SelectItem>
              <SelectItem value="Daily">Daily</SelectItem>
              <SelectItem value="Twice Daily">Twice Daily</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Button onClick={() => onSave(local)} className="w-full" data-testid="button-save-settings">
        <Save className="h-4 w-4 mr-2" />Save Discovery Settings
      </Button>
    </div>
  );
}

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

  const saveMutation = useMutation({
    mutationFn: (data: DiscoverySettings) => apiRequest("PUT", "/api/discovery/settings", data),
    onSuccess: () => {
      toast({ title: "Settings Saved" });
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Job Discovery</h1>
          <p className="text-muted-foreground">Automatically find jobs from public sources and send them into your inbox for review.</p>
        </div>
        <div className="flex gap-2">
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
      </div>

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

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-sm font-medium" data-testid="stat-last-run">
              {latestRun?.completedAt ? new Date(latestRun.completedAt).toLocaleString() : latestRun?.startedAt ? "Running..." : "Never"}
            </div>
            <div className="text-xs text-muted-foreground">Last Run</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="results">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="results" data-testid="tab-results"><Search className="h-4 w-4 mr-1" />Discovery Results</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings"><RefreshCw className="h-4 w-4 mr-1" />Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="space-y-4">
          {results.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No discovery results yet. Configure your settings and run a discovery scan.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Discovery History</CardTitle>
                <CardDescription>{results.length} results from recent discovery runs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Job Title</th>
                        <th className="pb-2 font-medium">Company</th>
                        <th className="pb-2 font-medium">Source</th>
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
                          <td className="py-2 pr-2 text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                          <td className="py-2 pr-2"><ResultsBadge result={r.importResult} /></td>
                          <td className="py-2 pr-2">{r.isDuplicate ? <Badge variant="secondary">Yes</Badge> : <span className="text-muted-foreground">No</span>}</td>
                          <td className="py-2 pr-2">{r.classification || "—"}</td>
                          <td className="py-2 pr-2 max-w-[150px] truncate">{r.recommendedResume || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings">
          {settingsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : settings ? (
            <SettingsPanel settings={settings} onSave={(s) => saveMutation.mutate(s)} />
          ) : null}
        </TabsContent>
      </Tabs>

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
