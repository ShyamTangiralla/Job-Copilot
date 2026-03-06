import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon, Plus, X, RefreshCw, Target } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import type { Settings as SettingsType } from "@shared/schema";

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

export default function SettingsPage() {
  const { toast } = useToast();
  const [newRole, setNewRole] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [weights, setWeights] = useState<ScoringWeights>({
    roleMatch: 25, freshness: 20, experienceLevel: 15, keywordMatch: 15, location: 15, sourceQuality: 5, resumeMatch: 5,
  });

  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

  const { data: savedWeights } = useQuery<ScoringWeights>({
    queryKey: ["/api/scoring-weights"],
  });

  useEffect(() => {
    if (savedWeights) setWeights(savedWeights);
  }, [savedWeights]);

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
    </div>
  );
}
