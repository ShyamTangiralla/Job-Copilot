import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, Plus, X, RefreshCw, Target, Sparkles, Brain, FileText, BarChart3, Upload, Trash2, Download, FileDown, SlidersHorizontal } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import type { Settings as SettingsType } from "@shared/schema";
import { JOB_SOURCES } from "@shared/schema";

interface SettingsData {
  roleCategories: string[];
  sources: string[];
  statuses: string[];
}

interface ScoringWeights {
  roleMatch: number;
  freshness: number;
  experienceLevel: number;
  keywordMatch: number;
  location: number;
  sourceQuality: number;
  resumeMatch: number;
}

interface UserPreferences {
  defaultJobSource: string;
  defaultPriority: string;
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  salaryCurrency: string;
  weeklyApplicationTarget: number;
  followUpReminderDays: number;
}

const PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;
const CURRENCY_OPTIONS = ["USD", "CAD", "GBP", "EUR", "INR", "AUD"] as const;

export default function SettingsPage() {
  const { toast } = useToast();
  const [newRole, setNewRole] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [weights, setWeights] = useState<ScoringWeights>({
    roleMatch: 25, freshness: 20, experienceLevel: 15, keywordMatch: 15, location: 15, sourceQuality: 5, resumeMatch: 5,
  });
  const [prefs, setPrefs] = useState<UserPreferences>({
    defaultJobSource: "",
    defaultPriority: "Medium",
    expectedSalaryMin: null,
    expectedSalaryMax: null,
    salaryCurrency: "USD",
    weeklyApplicationTarget: 5,
    followUpReminderDays: 7,
  });

  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

  const { data: savedWeights } = useQuery<ScoringWeights>({
    queryKey: ["/api/scoring-weights"],
  });

  const { data: savedPrefs } = useQuery<UserPreferences>({
    queryKey: ["/api/user-preferences"],
  });

  const { data: aiUsage } = useQuery<{ total: number; byFeature: Record<string, number> }>({
    queryKey: ["/api/ai-usage"],
  });

  const { data: templateStatus, refetch: refetchTemplate } = useQuery<{ exists: boolean }>({
    queryKey: ["/api/resume-template-status"],
    queryFn: async () => {
      const res = await fetch("/api/resume-template");
      return { exists: res.ok };
    },
  });
  const [templateUploading, setTemplateUploading] = useState(false);

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".docx")) {
      toast({ title: "Please upload a .docx file", variant: "destructive" });
      return;
    }
    setTemplateUploading(true);
    try {
      const form = new FormData();
      form.append("template", file);
      const res = await fetch("/api/resume-template", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).message);
      toast({ title: "Template uploaded", description: "Your custom DOCX template is now active." });
      refetchTemplate();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setTemplateUploading(false);
      e.target.value = "";
    }
  };

  const handleTemplateDelete = async () => {
    try {
      const res = await fetch("/api/resume-template", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).message);
      toast({ title: "Template removed", description: "Reverted to built-in ATS layout." });
      refetchTemplate();
    } catch (err: any) {
      toast({ title: "Failed to remove template", description: err.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (savedWeights) setWeights(savedWeights);
  }, [savedWeights]);

  useEffect(() => {
    if (savedPrefs) setPrefs(savedPrefs);
  }, [savedPrefs]);

  const updatePreferences = useMutation({
    mutationFn: async (data: UserPreferences) => {
      const res = await apiRequest("PUT", "/api/user-preferences", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-preferences"] });
      toast({ title: "Preferences saved" });
    },
    onError: (e: any) => {
      toast({ title: "Failed to save preferences", description: e.message, variant: "destructive" });
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (data: SettingsData) => {
      const res = await apiRequest("PUT", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved" });
    },
  });

  const updateWeights = useMutation({
    mutationFn: async (data: ScoringWeights) => {
      const res = await apiRequest("PUT", "/api/scoring-weights", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scoring-weights"] });
      toast({ title: "Scoring weights saved" });
    },
  });

  const recalculateScores = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/jobs/recalculate-scores");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Scores recalculated", description: data.message });
    },
  });

  const addItem = (field: keyof SettingsData, value: string) => {
    if (!value.trim() || !settings) return;
    const updated = { ...settings, [field]: [...settings[field], value.trim()] };
    updateSettings.mutate(updated);
    if (field === "roleCategories") setNewRole("");
    if (field === "sources") setNewSource("");
    if (field === "statuses") setNewStatus("");
  };

  const removeItem = (field: keyof SettingsData, index: number) => {
    if (!settings) return;
    const updated = { ...settings, [field]: settings[field].filter((_, i) => i !== index) };
    updateSettings.mutate(updated);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage role categories, sources, and application statuses.
        </p>
      </div>

      {/* ── Job Search Preferences ──────────────────────────────────── */}
      <Card data-testid="card-user-preferences">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Job Search Preferences
          </CardTitle>
          <CardDescription>
            Default values used when adding new jobs, and targets for your weekly activity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Row 1: Default Source + Default Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pref-source">Default Job Source</Label>
              <Select
                value={prefs.defaultJobSource || "__none__"}
                onValueChange={(v) => setPrefs({ ...prefs, defaultJobSource: v === "__none__" ? "" : v })}
              >
                <SelectTrigger id="pref-source" data-testid="select-default-source">
                  <SelectValue placeholder="None (select manually)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (select manually)</SelectItem>
                  {JOB_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Pre-filled when adding a new job.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pref-priority">Default Priority</Label>
              <Select
                value={prefs.defaultPriority}
                onValueChange={(v) => setPrefs({ ...prefs, defaultPriority: v })}
              >
                <SelectTrigger id="pref-priority" data-testid="select-default-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Applied to new jobs automatically.</p>
            </div>
          </div>

          {/* Row 2: Salary Range */}
          <div className="space-y-1.5">
            <Label>Expected Salary Range</Label>
            <div className="flex items-center gap-2">
              <Select
                value={prefs.salaryCurrency}
                onValueChange={(v) => setPrefs({ ...prefs, salaryCurrency: v })}
              >
                <SelectTrigger className="w-24 shrink-0" data-testid="select-salary-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                placeholder="Min salary"
                value={prefs.expectedSalaryMin ?? ""}
                onChange={(e) => setPrefs({ ...prefs, expectedSalaryMin: e.target.value ? parseInt(e.target.value) : null })}
                data-testid="input-salary-min"
              />
              <span className="text-muted-foreground text-sm shrink-0">to</span>
              <Input
                type="number"
                min={0}
                placeholder="Max salary"
                value={prefs.expectedSalaryMax ?? ""}
                onChange={(e) => setPrefs({ ...prefs, expectedSalaryMax: e.target.value ? parseInt(e.target.value) : null })}
                data-testid="input-salary-max"
              />
            </div>
            <p className="text-xs text-muted-foreground">Used in Salary Analytics for benchmarking your target range.</p>
          </div>

          {/* Row 3: Weekly Target + Follow-up Days */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pref-weekly-target">Weekly Application Target</Label>
              <Input
                id="pref-weekly-target"
                type="number"
                min={1}
                max={50}
                value={prefs.weeklyApplicationTarget}
                onChange={(e) => setPrefs({ ...prefs, weeklyApplicationTarget: parseInt(e.target.value) || 1 })}
                data-testid="input-weekly-target"
              />
              <p className="text-xs text-muted-foreground">Used in your Job Search Score (current target: 8/week).</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pref-followup-days">Follow-up Reminder Days</Label>
              <Input
                id="pref-followup-days"
                type="number"
                min={1}
                max={60}
                value={prefs.followUpReminderDays}
                onChange={(e) => setPrefs({ ...prefs, followUpReminderDays: parseInt(e.target.value) || 7 })}
                data-testid="input-followup-days"
              />
              <p className="text-xs text-muted-foreground">Days after applying before a follow-up is suggested.</p>
            </div>
          </div>

          <div className="pt-1 flex justify-end">
            <Button
              onClick={() => updatePreferences.mutate(prefs)}
              disabled={updatePreferences.isPending}
              data-testid="button-save-preferences"
            >
              {updatePreferences.isPending ? "Saving…" : "Save Preferences"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Role Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(settings?.roleCategories ?? []).map((role, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {role}
                <button onClick={() => removeItem("roleCategories", i)} className="ml-1" data-testid={`button-remove-role-${i}`}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="Add role category..."
              onKeyDown={(e) => e.key === "Enter" && addItem("roleCategories", newRole)}
              data-testid="input-new-role"
            />
            <Button size="sm" variant="secondary" onClick={() => addItem("roleCategories", newRole)} data-testid="button-add-role">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Job Sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(settings?.sources ?? []).map((source, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {source}
                <button onClick={() => removeItem("sources", i)} className="ml-1" data-testid={`button-remove-source-${i}`}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              placeholder="Add source..."
              onKeyDown={(e) => e.key === "Enter" && addItem("sources", newSource)}
              data-testid="input-new-source"
            />
            <Button size="sm" variant="secondary" onClick={() => addItem("sources", newSource)} data-testid="button-add-source">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Application Statuses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(settings?.statuses ?? []).map((status, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {status}
                <button onClick={() => removeItem("statuses", i)} className="ml-1" data-testid={`button-remove-status-${i}`}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              placeholder="Add status..."
              onKeyDown={(e) => e.key === "Enter" && addItem("statuses", newStatus)}
              data-testid="input-new-status"
            />
            <Button size="sm" variant="secondary" onClick={() => addItem("statuses", newStatus)} data-testid="button-add-status">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Apply Priority Scoring Weights
          </CardTitle>
          <CardDescription>
            Adjust how much each factor contributes to the Apply Priority Score (0-100). Total should equal 100 for balanced scoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              { key: "roleMatch" as const, label: "Role Match", desc: "Primary/secondary role fit" },
              { key: "freshness" as const, label: "Freshness", desc: "How recently posted" },
              { key: "experienceLevel" as const, label: "Experience Level", desc: "Entry/mid vs senior" },
              { key: "keywordMatch" as const, label: "Keyword Match", desc: "SQL, Python, etc." },
              { key: "location" as const, label: "Location & Work Mode", desc: "Remote, preferred locations" },
              { key: "sourceQuality" as const, label: "Source Quality", desc: "Greenhouse, Lever, etc." },
              { key: "resumeMatch" as const, label: "Resume Match", desc: "Resume available for role" },
            ]).map(({ key, label, desc }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{label}</Label>
                  <span className="text-sm font-medium tabular-nums" data-testid={`text-weight-${key}`}>{weights[key]}</span>
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={weights[key]}
                  onChange={(e) => setWeights({ ...weights, [key]: parseInt(e.target.value) || 0 })}
                  data-testid={`input-weight-${key}`}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-muted-foreground">
              Total: <span className={`font-medium ${Object.values(weights).reduce((a, b) => a + b, 0) === 100 ? "text-green-600" : "text-amber-600"}`} data-testid="text-weight-total">
                {Object.values(weights).reduce((a, b) => a + b, 0)}
              </span> / 100
            </div>
            <Button
              size="sm"
              onClick={() => updateWeights.mutate(weights)}
              disabled={updateWeights.isPending}
              data-testid="button-save-weights"
            >
              Save Weights
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Recalculate Scores
          </CardTitle>
          <CardDescription>
            Recalculate Apply Priority Scores for all existing jobs using the current scoring weights.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => recalculateScores.mutate()}
            disabled={recalculateScores.isPending}
            data-testid="button-recalculate-scores"
          >
            {recalculateScores.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Recalculating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Recalculate All Scores
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Card data-testid="card-ai-usage">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            AI Usage
          </CardTitle>
          <CardDescription>
            Tracks how many times AI features have been used. Limits: Resume optimization (2/job), Cover letter (2/job), Job match analysis (cached after first run).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1 text-center p-3 rounded-lg bg-muted/40" data-testid="stat-ai-total">
              <div className="text-2xl font-semibold tabular-nums">{aiUsage?.total ?? 0}</div>
              <div className="text-xs text-muted-foreground">Total AI Calls</div>
            </div>
            <div className="space-y-1 text-center p-3 rounded-lg bg-muted/40" data-testid="stat-ai-resume-optimization">
              <div className="text-2xl font-semibold tabular-nums text-violet-600 dark:text-violet-400">
                {aiUsage?.byFeature?.["resume-optimization"] ?? 0}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Brain className="h-3 w-3" />
                Resume Opt.
              </div>
            </div>
            <div className="space-y-1 text-center p-3 rounded-lg bg-muted/40" data-testid="stat-ai-cover-letter">
              <div className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {aiUsage?.byFeature?.["cover-letter"] ?? 0}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <FileText className="h-3 w-3" />
                Cover Letter
              </div>
            </div>
            <div className="space-y-1 text-center p-3 rounded-lg bg-muted/40" data-testid="stat-ai-job-match">
              <div className="text-2xl font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">
                {aiUsage?.byFeature?.["job-match"] ?? 0}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <BarChart3 className="h-3 w-3" />
                Job Match
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── ATS Resume Template ─────────────────────────────────────────── */}
      <Card data-testid="card-ats-template">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <FileDown className="h-4 w-4 text-primary" />
            ATS Resume Export Template
          </CardTitle>
          <CardDescription>
            Upload your own <strong>.docx</strong> file with <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{NAME}}"}</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{CONTACT}}"}</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{SUMMARY}}"}</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{SKILLS}}"}</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{EXPERIENCE}}"}</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{PROJECTS}}"}</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{EDUCATION}}"}</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{{CERTIFICATIONS}}"}</code> placeholders.
            Without a custom template, resumes export using the built-in ATS layout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            {templateStatus?.exists ? (
              <Badge variant="default" className="bg-green-600 dark:bg-green-700 text-white">Custom template active</Badge>
            ) : (
              <Badge variant="secondary">Using built-in ATS layout</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="template-upload" className="cursor-pointer">
              <Button variant="outline" size="sm" className="gap-2 pointer-events-none" asChild={false} disabled={templateUploading} data-testid="button-upload-template">
                {templateUploading ? (
                  <><span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Uploading…</>
                ) : (
                  <><Upload className="h-4 w-4" />{templateStatus?.exists ? "Replace Template" : "Upload Template"}</>
                )}
              </Button>
              <input
                id="template-upload"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={handleTemplateUpload}
                data-testid="input-template-upload"
              />
            </label>
            {templateStatus?.exists && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => window.open("/api/resume-template", "_blank")}
                  data-testid="button-download-template"
                >
                  <Download className="h-4 w-4" />Download Template
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={handleTemplateDelete}
                  data-testid="button-delete-template"
                >
                  <Trash2 className="h-4 w-4" />Remove Template
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
