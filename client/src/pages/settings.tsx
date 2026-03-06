import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon, Plus, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Settings as SettingsType } from "@shared/schema";

interface SettingsData {
  roleCategories: string[];
  sources: string[];
  statuses: string[];
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [newRole, setNewRole] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newStatus, setNewStatus] = useState("");

  const { data: settings, isLoading } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
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
    </div>
  );
}
