import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Plus,
  Search,
  ExternalLink,
  Filter,
  X,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Job } from "@shared/schema";
import { JOB_STATUSES, ROLE_TYPES, WORK_MODES } from "@shared/schema";

export default function JobsInbox() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [keyword, setKeyword] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterWorkMode, setFilterWorkMode] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: jobs, isLoading } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const createJob = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/jobs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setDialogOpen(false);
      toast({ title: "Job added successfully" });
    },
  });

  const sources = [...new Set(jobs?.map((j) => j.source).filter(Boolean) ?? [])];

  const filtered = (jobs ?? []).filter((job) => {
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
    return true;
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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createJob.mutate({
      title: fd.get("title") as string,
      company: fd.get("company") as string,
      source: fd.get("source") as string,
      location: fd.get("location") as string,
      workMode: fd.get("workMode") as string,
      datePosted: fd.get("datePosted") as string,
      description: fd.get("description") as string,
      applyLink: fd.get("applyLink") as string,
      notes: fd.get("notes") as string,
    });
  };

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Jobs Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} job{filtered.length !== 1 ? "s" : ""} found
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-job">
              <Plus className="h-4 w-4 mr-1" />
              Add Job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Job</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="title">Job Title *</Label>
                  <Input id="title" name="title" required data-testid="input-job-title" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="company">Company *</Label>
                  <Input id="company" name="company" required data-testid="input-job-company" />
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
              <div className="grid grid-cols-2 gap-3">
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
              </div>
              <div className="space-y-1">
                <Label htmlFor="applyLink">Apply Link</Label>
                <Input id="applyLink" name="applyLink" type="url" placeholder="https://..." data-testid="input-apply-link" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Job Description</Label>
                <Textarea id="description" name="description" rows={4} data-testid="input-description" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={2} data-testid="input-notes" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)} data-testid="button-cancel-job">
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
          {(filterRole !== "all" || filterStatus !== "all" || filterWorkMode !== "all" || filterSource !== "all") && (
            <span className="ml-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
              {[filterRole, filterStatus, filterWorkMode, filterSource].filter((f) => f !== "all").length}
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
                    {ROLE_TYPES.map((r) => (
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
              <Button
                variant="secondary"
                size="sm"
                className="mt-5"
                onClick={() => { setFilterRole("all"); setFilterStatus("all"); setFilterWorkMode("all"); setFilterSource("all"); }}
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
              <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
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
                    <TableHead>Classification</TableHead>
                    <TableHead>Fit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((job) => (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      data-testid={`row-job-${job.id}`}
                    >
                      <TableCell className="font-medium">{job.title}</TableCell>
                      <TableCell>{job.company}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{job.source}</TableCell>
                      <TableCell className="text-sm">{job.location}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{job.workMode}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{job.roleClassification}</TableCell>
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
                        {job.applyLink && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); window.open(job.applyLink, "_blank"); }}
                            data-testid={`button-apply-link-${job.id}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
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
  );
}
