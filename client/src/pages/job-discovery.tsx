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
import { Loader2, Play, Square, Save, Search, CheckCircle2, XCircle, AlertTriangle, Clock, Globe, Building2, Zap, ChevronDown, ChevronUp } from "lucide-react";
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
