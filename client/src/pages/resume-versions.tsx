import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  History, FileDown, Trash2, Eye, ArrowUpRight,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ResumeVersion, Job } from "@shared/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const color = score >= 80 ? "bg-green-100 text-green-800" : score >= 60 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label && <span className="text-[10px] opacity-70">{label}</span>}
      {score}%
    </span>
  );
}

function ScoreDelta({ before, after }: { before: number; after: number }) {
  const delta = after - before;
  if (delta > 0) return <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium"><TrendingUp className="h-3 w-3" />+{delta}</span>;
  if (delta < 0) return <span className="flex items-center gap-0.5 text-xs text-red-500 font-medium"><TrendingDown className="h-3 w-3" />{delta}</span>;
  return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0</span>;
}

// ─── Section viewer ───────────────────────────────────────────────────────────

function SectionBlock({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  if (!content?.trim()) return null;
  const preview = content.split("\n").filter(Boolean)[0] ?? "";
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(v => !v)}
        data-testid={`toggle-section-${title.toLowerCase()}`}
      >
        <span>{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs bg-background">
          {content}
        </div>
      )}
      {!open && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground truncate border-t bg-background">
          {preview}
        </div>
      )}
    </div>
  );
}

// ─── Version detail dialog ────────────────────────────────────────────────────

function VersionDetailDialog({
  version,
  open,
  onClose,
  onExportDocx,
  onExportPdf,
}: {
  version: ResumeVersion;
  open: boolean;
  onClose: () => void;
  onExportDocx: () => void;
  onExportPdf: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Resume Version {version.versionLabel}
          </DialogTitle>
          <DialogDescription>
            {version.jobTitle || "Untitled"} @ {version.company || "Unknown Company"} · {fmt(version.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 pb-2">
          <Button size="sm" variant="outline" onClick={onExportDocx} data-testid="button-export-docx">
            <FileDown className="h-4 w-4 mr-1" /> Export DOCX
          </Button>
          <Button size="sm" variant="outline" onClick={onExportPdf} data-testid="button-export-pdf">
            <FileDown className="h-4 w-4 mr-1" /> Export PDF
          </Button>
          {version.jobId && (
            <Link href={`/jobs/${version.jobId}`}>
              <Button size="sm" variant="ghost" data-testid="link-view-job">
                <ArrowUpRight className="h-4 w-4 mr-1" /> View Job
              </Button>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3 py-2 border-y">
          <div className="text-sm text-muted-foreground">ATS Score</div>
          <ScoreBadge score={version.atsScoreBefore} label="Before" />
          <span className="text-muted-foreground">→</span>
          <ScoreBadge score={version.atsScoreAfter} label="After" />
          <ScoreDelta before={version.atsScoreBefore} after={version.atsScoreAfter} />
        </div>

        <div className="space-y-2 pt-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Candidate</div>
          <div className="text-sm font-medium">{version.candidateName}</div>
          <div className="text-xs text-muted-foreground">{version.contact}</div>
        </div>

        <Separator />

        <div className="space-y-2">
          <SectionBlock title="Summary" content={version.summary} />
          <SectionBlock title="Skills" content={version.skills} />
          <SectionBlock title="Experience" content={version.experience} />
          <SectionBlock title="Projects" content={version.projects} />
          <SectionBlock title="Education" content={version.education} />
          <SectionBlock title="Certifications" content={version.certifications} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResumeVersionsPage() {
  const { toast } = useToast();
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [viewing, setViewing] = useState<ResumeVersion | null>(null);
  const [deleting, setDeleting] = useState<ResumeVersion | null>(null);

  const { data: versions = [], isLoading } = useQuery<ResumeVersion[]>({
    queryKey: ["/api/resume-versions"],
  });

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/resume-versions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resume-versions"] });
      setDeleting(null);
      toast({ title: "Version deleted." });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const triggerDownload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  const handleExportDocx = (v: ResumeVersion) => {
    const name = `${v.company || "Resume"}_${v.jobTitle || ""}_${v.versionLabel}`.replace(/[^a-z0-9_\-]/gi, "_");
    triggerDownload(`/api/resume-versions/${v.id}/export-docx`, `${name}.docx`);
  };

  const handleExportPdf = (v: ResumeVersion) => {
    const name = `${v.company || "Resume"}_${v.jobTitle || ""}_${v.versionLabel}`.replace(/[^a-z0-9_\-]/gi, "_");
    triggerDownload(`/api/resume-versions/${v.id}/export-pdf`, `${name}.pdf`);
  };

  // Build list of unique jobs that have versions
  const jobsWithVersions = jobs.filter(j => versions.some(v => v.jobId === j.id));

  const filtered = jobFilter === "all"
    ? versions
    : versions.filter(v => v.jobId === parseInt(jobFilter));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <History className="h-6 w-6 text-primary" />
            Resume Versions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every AI-tailored resume is saved here — one version per job optimization.
          </p>
        </div>
        <Badge variant="outline" className="text-sm" data-testid="badge-version-count">
          {versions.length} version{versions.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Filter */}
      {jobsWithVersions.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filter by job:</span>
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="w-64" data-testid="select-job-filter">
              <SelectValue placeholder="All jobs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jobs</SelectItem>
              {jobsWithVersions.map(j => (
                <SelectItem key={j.id} value={String(j.id)} data-testid={`option-job-${j.id}`}>
                  {j.title} @ {j.company}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <History className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-muted-foreground">No resume versions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Run the AI optimizer on a job to generate and save a tailored version.
            </p>
            <Link href="/jobs">
              <Button variant="outline" className="mt-4" data-testid="link-go-to-jobs">
                Go to Jobs Inbox
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => (
            <Card key={v.id} className="hover:shadow-sm transition-shadow" data-testid={`card-version-${v.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="font-mono text-xs" data-testid={`badge-label-${v.id}`}>
                        {v.versionLabel}
                      </Badge>
                      <span className="font-medium text-sm truncate" data-testid={`text-job-title-${v.id}`}>
                        {v.jobTitle || "Untitled Role"}
                      </span>
                      {v.company && (
                        <>
                          <span className="text-muted-foreground text-sm">@</span>
                          <span className="text-sm text-muted-foreground" data-testid={`text-company-${v.id}`}>{v.company}</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <ScoreBadge score={v.atsScoreBefore} label="Before" />
                      <span className="text-muted-foreground text-xs">→</span>
                      <ScoreBadge score={v.atsScoreAfter} label="After" />
                      <ScoreDelta before={v.atsScoreBefore} after={v.atsScoreAfter} />
                      <span className="text-xs text-muted-foreground ml-auto" data-testid={`text-date-${v.id}`}>
                        {fmt(v.createdAt)}
                      </span>
                    </div>

                    {v.candidateName && (
                      <p className="text-xs text-muted-foreground mt-1">{v.candidateName}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setViewing(v)}
                      title="Preview sections"
                      data-testid={`button-preview-${v.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleExportDocx(v)}
                      title="Export DOCX"
                      data-testid={`button-docx-${v.id}`}
                    >
                      <FileDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleting(v)}
                      title="Delete version"
                      data-testid={`button-delete-${v.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    {v.jobId && (
                      <Link href={`/jobs/${v.jobId}`}>
                        <Button size="icon" variant="ghost" title="View job" data-testid={`link-job-${v.id}`}>
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      {viewing && (
        <VersionDetailDialog
          version={viewing}
          open={!!viewing}
          onClose={() => setViewing(null)}
          onExportDocx={() => handleExportDocx(viewing)}
          onExportPdf={() => handleExportPdf(viewing)}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this version?</AlertDialogTitle>
            <AlertDialogDescription>
              Version <strong>{deleting?.versionLabel}</strong> for{" "}
              <strong>{deleting?.jobTitle || "this job"}</strong> will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
