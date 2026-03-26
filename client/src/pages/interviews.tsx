import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  MessageSquare, Trophy, Calendar, Building2,
  ExternalLink, CheckCircle2, XCircle, Clock, Edit3, Award,
} from "lucide-react";
import type { Job } from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────
const INTERVIEW_STATUSES = new Set(["Interview", "Final Round", "Offer", "Rejected", "No Response"]);
const ROUND_OPTIONS = ["Phone Screen", "Round 1", "Round 2", "Round 3", "Technical", "Panel", "Final Round", "Other"];
const RESULT_OPTIONS = ["Pending", "Passed", "Rejected", "Offer Received", "Withdrawn"];

const RESULT_COLORS: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  Passed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  Rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  "Offer Received": "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300",
  Withdrawn: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_COLORS: Record<string, string> = {
  Interview: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300",
  "Final Round": "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  Offer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  Rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  "No Response": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Edit Interview Dialog ─────────────────────────────────────────────────
interface EditDialogProps {
  job: Job | null;
  onClose: () => void;
}

function EditInterviewDialog({ job, onClose }: EditDialogProps) {
  const { toast } = useToast();
  const [round, setRound] = useState(job?.interviewRound || "");
  const [result, setResult] = useState(job?.interviewResult || "");
  const [interviewDate, setInterviewDate] = useState(job?.interviewDate || "");
  const [notes, setNotes] = useState(job?.notes || "");

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Job>) => apiRequest("PATCH", `/api/jobs/${job!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Interview updated" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  if (!job) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Interview</DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{job.title} · {job.company}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Interview Round</label>
              <Select value={round} onValueChange={setRound}>
                <SelectTrigger data-testid="select-interview-round">
                  <SelectValue placeholder="Select round" />
                </SelectTrigger>
                <SelectContent>
                  {ROUND_OPTIONS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Result</label>
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger data-testid="select-interview-result">
                  <SelectValue placeholder="Select result" />
                </SelectTrigger>
                <SelectContent>
                  {RESULT_OPTIONS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Interview Date</label>
            <Input
              type="date"
              value={interviewDate}
              onChange={e => setInterviewDate(e.target.value)}
              data-testid="input-interview-date"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Interviewer name, topics covered, feedback..."
              rows={4}
              data-testid="textarea-interview-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => updateMutation.mutate({ interviewRound: round, interviewResult: result, interviewDate, notes })}
            disabled={updateMutation.isPending}
            data-testid="button-save-interview"
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InterviewsPage() {
  const [editJob, setEditJob] = useState<Job | null>(null);

  const { data: jobs, isLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });

  const interviewJobs = (jobs ?? [])
    .filter(j => INTERVIEW_STATUSES.has(j.status))
    .sort((a, b) => {
      const da = a.interviewDate || a.dateApplied || "";
      const db = b.interviewDate || b.dateApplied || "";
      return db.localeCompare(da);
    });

  const stats = {
    total: interviewJobs.length,
    pending: interviewJobs.filter(j => !j.interviewResult || j.interviewResult === "Pending").length,
    passed: interviewJobs.filter(j => j.interviewResult === "Passed" || j.status === "Final Round" || j.status === "Offer").length,
    offers: interviewJobs.filter(j => j.interviewResult === "Offer Received" || j.status === "Offer").length,
    rejected: interviewJobs.filter(j => j.interviewResult === "Rejected" || j.status === "Rejected").length,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Interview Tracker</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track every interview round, result, and notes in one place.
        </p>
      </div>

      {/* Summary cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Interviews", value: stats.total, icon: MessageSquare, color: "text-cyan-500" },
            { label: "Pending Results", value: stats.pending, icon: Clock, color: "text-amber-500" },
            { label: "Passed / Advanced", value: stats.passed, icon: CheckCircle2, color: "text-emerald-500" },
            { label: "Offers", value: stats.offers, icon: Trophy, color: "text-indigo-500" },
            { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-rose-500" },
          ].map(card => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium leading-tight">{card.label}</span>
                  <card.icon className={`h-4 w-4 shrink-0 ${card.color}`} />
                </div>
                <p className="text-2xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Interview list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : interviewJobs.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No interviews yet</p>
            <p className="text-xs text-center max-w-xs">
              When you mark a job as "Interview" or "Final Round", it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {interviewJobs.map(job => {
            const resultLabel = job.interviewResult || "Pending";
            const roundLabel = job.interviewRound || "—";
            const daysSinceInterview = job.interviewDate
              ? Math.floor((Date.now() - new Date(job.interviewDate).getTime()) / 86400000)
              : null;
            const needsFollowUp = daysSinceInterview != null && daysSinceInterview >= 5
              && (!job.interviewResult || job.interviewResult === "Pending");

            return (
              <Card key={job.id} className={needsFollowUp ? "border-amber-300 dark:border-amber-700" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-950/50 shrink-0">
                      <MessageSquare className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <Link href={`/jobs/${job.id}`}>
                            <a className="font-semibold text-sm hover:underline truncate block" data-testid={`link-job-${job.id}`}>
                              {job.title}
                            </a>
                          </Link>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <Building2 className="h-3 w-3" />
                            <span>{job.company}</span>
                            {job.location && (
                              <>
                                <span>·</span>
                                <span>{job.location}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          {needsFollowUp && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-0">
                              Follow-up needed
                            </Badge>
                          )}
                          <Badge className={`text-[10px] border-0 ${STATUS_COLORS[job.status] ?? "bg-muted text-muted-foreground"}`}>
                            {job.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Round</p>
                          <p className="text-xs font-medium mt-0.5">{roundLabel}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Result</p>
                          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${RESULT_COLORS[resultLabel] ?? "bg-muted text-muted-foreground"}`}>
                            {resultLabel}
                          </span>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Interview Date</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{fmtDate(job.interviewDate)}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Applied</p>
                          <span className="text-xs">{fmtDate(job.dateApplied)}</span>
                        </div>
                      </div>

                      {/* Notes */}
                      {job.notes && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">
                          "{job.notes}"
                        </p>
                      )}
                    </div>

                    {/* Edit button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-8 w-8 p-0"
                      onClick={() => setEditJob(job)}
                      data-testid={`button-edit-interview-${job.id}`}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      {editJob && (
        <EditInterviewDialog job={editJob} onClose={() => setEditJob(null)} />
      )}
    </div>
  );
}
