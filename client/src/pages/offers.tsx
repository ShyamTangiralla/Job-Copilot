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
  Trophy, DollarSign, Calendar, Building2, Clock,
  CheckCircle2, XCircle, Edit3, TrendingUp, AlertCircle,
} from "lucide-react";
import type { Job } from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────
const OFFER_STATUSES = new Set(["Offer"]);
const DECISION_OPTIONS = ["Pending", "Accepted", "Rejected", "Negotiating", "Withdrawn"];

const DECISION_COLORS: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  Accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  Rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  Negotiating: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  Withdrawn: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function fmtSalary(s: string) {
  if (!s) return "—";
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return s;
  return "$" + n.toLocaleString();
}

// ─── Edit Offer Dialog ─────────────────────────────────────────────────────
interface EditOfferDialogProps {
  job: Job | null;
  onClose: () => void;
}

function EditOfferDialog({ job, onClose }: EditOfferDialogProps) {
  const { toast } = useToast();
  const [salary, setSalary] = useState(job?.offerSalary || "");
  const [offerDate, setOfferDate] = useState(job?.offerDate || "");
  const [deadline, setDeadline] = useState(job?.offerDeadline || "");
  const [decision, setDecision] = useState(job?.offerDecision || "Pending");
  const [notes, setNotes] = useState(job?.offerNotes || "");

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Job>) => apiRequest("PATCH", `/api/jobs/${job!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Offer updated" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  if (!job) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Offer Details</DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{job.title} · {job.company}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Offer Salary</label>
              <Input
                value={salary}
                onChange={e => setSalary(e.target.value)}
                placeholder="e.g. 95000 or $95,000"
                data-testid="input-offer-salary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Decision</label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger data-testid="select-offer-decision">
                  <SelectValue placeholder="Select decision" />
                </SelectTrigger>
                <SelectContent>
                  {DECISION_OPTIONS.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Offer Date</label>
              <Input
                type="date"
                value={offerDate}
                onChange={e => setOfferDate(e.target.value)}
                data-testid="input-offer-date"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Decision Deadline</label>
              <Input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                data-testid="input-offer-deadline"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Benefits, equity, signing bonus, negotiation details..."
              rows={4}
              data-testid="textarea-offer-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => updateMutation.mutate({
              offerSalary: salary,
              offerDate,
              offerDeadline: deadline,
              offerDecision: decision,
              offerNotes: notes,
            })}
            disabled={updateMutation.isPending}
            data-testid="button-save-offer"
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OffersPage() {
  const [editJob, setEditJob] = useState<Job | null>(null);

  const { data: jobs, isLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });

  const offerJobs = (jobs ?? [])
    .filter(j => OFFER_STATUSES.has(j.status))
    .sort((a, b) => {
      const da = a.offerDate || a.dateApplied || "";
      const db = b.offerDate || b.dateApplied || "";
      return db.localeCompare(da);
    });

  const stats = {
    total: offerJobs.length,
    pending: offerJobs.filter(j => !j.offerDecision || j.offerDecision === "Pending").length,
    accepted: offerJobs.filter(j => j.offerDecision === "Accepted").length,
    rejected: offerJobs.filter(j => j.offerDecision === "Rejected").length,
    negotiating: offerJobs.filter(j => j.offerDecision === "Negotiating").length,
  };

  const salaries = offerJobs
    .map(j => parseFloat((j.offerSalary ?? "").replace(/[^0-9.]/g, "")))
    .filter(n => !isNaN(n) && n > 0);
  const avgSalary = salaries.length > 0
    ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length)
    : null;
  const maxSalary = salaries.length > 0 ? Math.max(...salaries) : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Trophy className="h-6 w-6 text-primary" />
          Offer Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track every offer, salary, deadline, and decision in one place.
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
            { label: "Total Offers", value: stats.total, icon: Trophy, color: "text-indigo-500" },
            { label: "Pending Decision", value: stats.pending, icon: Clock, color: "text-amber-500" },
            { label: "Accepted", value: stats.accepted, icon: CheckCircle2, color: "text-emerald-500" },
            { label: "Negotiating", value: stats.negotiating, icon: TrendingUp, color: "text-blue-500" },
            { label: "Declined", value: stats.rejected, icon: XCircle, color: "text-rose-500" },
          ].map(card => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium leading-tight">{card.label}</span>
                  <card.icon className={`h-4 w-4 shrink-0 ${card.color}`} />
                </div>
                <p className="text-2xl font-bold" data-testid={`text-stat-${card.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {card.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Salary summary */}
      {!isLoading && salaries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-emerald-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">Average Offer</p>
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  ${avgSalary?.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-indigo-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">Highest Offer</p>
                <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  ${maxSalary?.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-cyan-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">Offers Tracked</p>
                <p className="text-xl font-bold">{salaries.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Offer list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : offerJobs.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Trophy className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">No offers yet</p>
            <p className="text-xs text-center max-w-xs">
              When you mark a job as "Offer", it will appear here so you can track salary and your decision.
            </p>
            <Link href="/jobs">
              <a className="text-xs text-primary hover:underline">Go to Jobs Inbox</a>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {offerJobs.map(job => {
            const decision = job.offerDecision || "Pending";
            const days = daysUntil(job.offerDeadline);
            const deadlineUrgent = days != null && days >= 0 && days <= 3;
            const deadlinePassed = days != null && days < 0;

            return (
              <Card
                key={job.id}
                className={
                  deadlineUrgent
                    ? "border-amber-300 dark:border-amber-700"
                    : deadlinePassed
                    ? "border-rose-300 dark:border-rose-700"
                    : ""
                }
                data-testid={`card-offer-${job.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/50 shrink-0">
                      <Trophy className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <Link href={`/jobs/${job.id}`}>
                            <a
                              className="font-semibold text-sm hover:underline truncate block"
                              data-testid={`link-offer-job-${job.id}`}
                            >
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
                          {deadlineUrgent && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-0">
                              Deadline in {days}d
                            </Badge>
                          )}
                          {deadlinePassed && decision === "Pending" && (
                            <Badge className="text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-0">
                              Deadline passed
                            </Badge>
                          )}
                          <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded ${DECISION_COLORS[decision] ?? "bg-muted text-muted-foreground"}`}>
                            {decision}
                          </span>
                        </div>
                      </div>

                      {/* Meta grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Offered Salary</p>
                          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {fmtSalary(job.offerSalary)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Offer Date</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{fmtDate(job.offerDate)}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Decision Deadline</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {(deadlineUrgent || deadlinePassed) && (
                              <AlertCircle className={`h-3 w-3 ${deadlinePassed ? "text-rose-500" : "text-amber-500"}`} />
                            )}
                            <span className={`text-xs ${deadlinePassed ? "text-rose-500" : deadlineUrgent ? "text-amber-600" : ""}`}>
                              {fmtDate(job.offerDeadline)}
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Applied</p>
                          <span className="text-xs">{fmtDate(job.dateApplied)}</span>
                        </div>
                      </div>

                      {/* Notes */}
                      {job.offerNotes && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">
                          "{job.offerNotes}"
                        </p>
                      )}
                    </div>

                    {/* Edit button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-8 w-8 p-0"
                      onClick={() => setEditJob(job)}
                      data-testid={`button-edit-offer-${job.id}`}
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
        <EditOfferDialog job={editJob} onClose={() => setEditJob(null)} />
      )}
    </div>
  );
}
