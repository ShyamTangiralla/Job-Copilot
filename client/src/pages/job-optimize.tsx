import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Sparkles, Copy, FileText, AlertCircle, Download, Save,
  ArrowRight, Info, Check, Minus, Undo2, Loader2, CheckCircle, RefreshCw,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { exportTxt, exportDoc, exportPdf } from "@/lib/export-resume";
import type { Job, Resume } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Suggestion {
  id: string;
  keyword: string;
  section: "skills" | "experience" | "projects" | "summary";
  currentText: string;
  suggestedText: string;
  reason: string;
}

interface ATSBreakdown {
  atsScore: number;
  technicalSkillsPct: number;
  roleKeywordsPct: number;
  domainKeywordsPct: number;
  keywordAlignmentPct: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchedRoleKeywords: string[];
  missingRoleKeywords: string[];
  resumeName?: string | null;
}

interface AppliedEdit {
  keyword: string;
  section: string;
  resumeBefore: string; // full resume snapshot before this edit
}

type SuggestionStatus = "pending" | "ignored";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function kwPresent(text: string, kw: string): boolean {
  return new RegExp(`(?<![a-z0-9])${escapeRegex(kw)}(?![a-z0-9])`, "i").test(text);
}

const JD_SECTION_PATTERNS = [
  /^(about (the role|this role|the position|us|the company))/i,
  /^(job |role |position )?(summary|overview|description)/i,
  /^(key |core |primary )?(responsibilities|duties|what you'?ll? (do|own|lead|build|drive))/i,
  /^(required|minimum|basic) (qualifications?|requirements?|experience)/i,
  /^(preferred|nice.to.have|bonus|additional) (qualifications?|skills?|experience|requirements?)/i,
  /^(technical |required |key )?skills?( required| needed)?:?$/i,
  /^(qualifications?|requirements?):?$/i,
  /^(what we offer|benefits?|perks?|compensation|why join)/i,
  /^(our (team|mission|culture|values))/i,
  /^(experience( requirements?)?):?$/i,
  /^(education( requirements?)?):?$/i,
];

function countJDSections(text: string): number {
  const lines = text.split("\n");
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 4 || trimmed.length > 80) continue;
    if (JD_SECTION_PATTERNS.some(p => p.test(trimmed))) count++;
  }
  return count;
}

function highlightText(text: string, greenKws: string[], redKws: string[]): React.ReactNode[] {
  if (!text || (!greenKws.length && !redKws.length)) return [text];

  const all = [
    ...greenKws.map(k => ({ kw: k, color: "green" as const })),
    ...redKws.map(k => ({ kw: k, color: "red" as const })),
  ].sort((a, b) => b.kw.length - a.kw.length);

  const alternation = all.map(x => escapeRegex(x.kw)).join("|");
  const regex = new RegExp(`(?<![a-z0-9])(${alternation})(?![a-z0-9])`, "gi");
  const greenSet = new Set(greenKws.map(k => k.toLowerCase()));
  const redSet = new Set(redKws.map(k => k.toLowerCase()));

  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const lower = m[0].toLowerCase();
    if (greenSet.has(lower)) {
      parts.push(
        <mark key={m.index} className="bg-green-200 dark:bg-green-900/70 text-green-900 dark:text-green-200 rounded-sm px-0.5 font-semibold not-italic">
          {m[0]}
        </mark>
      );
    } else if (redSet.has(lower)) {
      parts.push(
        <mark key={m.index} className="bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 rounded-sm px-0.5 not-italic">
          {m[0]}
        </mark>
      );
    } else {
      parts.push(m[0]);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderLines(text: string, green: string[], red: string[]): React.ReactNode {
  return text.split("\n").map((line, i, arr) => (
    <span key={i}>{highlightText(line, green, red)}{i < arr.length - 1 && "\n"}</span>
  ));
}

function scoreColor(s: number) {
  if (s >= 70) return "text-green-700 dark:text-green-400";
  if (s >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function barCls(s: number) {
  if (s >= 70) return "[&>div]:bg-green-500";
  if (s >= 40) return "[&>div]:bg-yellow-500";
  return "[&>div]:bg-red-500";
}

function CategoryBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold">{value}%</span>
      </div>
      <Progress value={value} className={`h-1.5 ${barCls(value)}`} />
    </div>
  );
}

const SECTION_COLORS: Record<string, string> = {
  skills:     "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  experience: "bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  projects:   "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  summary:    "bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function JobOptimize() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const jobId = parseInt(id);

  // ── Resume & edit history ──────────────────────────────────────────────────
  const [workingResume, setWorkingResume] = useState("");
  // Stack: each entry is the full resume text BEFORE the corresponding edit
  const [resumeHistory, setResumeHistory] = useState<string[]>([]);
  const [editHistory, setEditHistory] = useState<AppliedEdit[]>([]);
  const [acceptedKeywords, setAcceptedKeywords] = useState<string[]>([]);

  // ── Suggestions for current round ─────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [missingKeywords, setMissingKeywords] = useState<string[]>([]);
  const [status, setStatus] = useState<Record<string, SuggestionStatus>>({});

  // ── Score & UI state ───────────────────────────────────────────────────────
  const [liveBreakdown, setLiveBreakdown] = useState<ATSBreakdown | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const [noApiKey, setNoApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: job, isLoading: jobLoading } = useQuery<Job>({ queryKey: ["/api/jobs", jobId] });
  const { data: resumes } = useQuery<Resume[]>({ queryKey: ["/api/resumes"] });
  const { data: initialBreakdown, isLoading: atsLoading } = useQuery<ATSBreakdown>({
    queryKey: ["/api/jobs", jobId, "ats-breakdown"],
    enabled: !!job,
  });

  const activeResume = resumes?.find(r => r.active) ?? resumes?.[0];

  const plainJobDesc = useMemo(
    () => (job?.description ? stripHtml(job.description) : job?.title ?? ""),
    [job]
  );

  const jdSectionCount = useMemo(() => countJDSections(plainJobDesc), [plainJobDesc]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  /** Fast, no-AI score recalculation. */
  const scoreMutation = useMutation({
    mutationFn: async (resumeText: string) => {
      const res = await apiRequest("POST", "/api/ats-score", { resumeText, jobDescription: plainJobDesc });
      return res.json() as Promise<ATSBreakdown>;
    },
    onSuccess: (data) => setLiveBreakdown(data),
  });

  /** AI suggestion generation — called on load + after every Accept/Undo. */
  const suggestionMutation = useMutation({
    mutationFn: async (resumeText: string) => {
      const res = await apiRequest("POST", "/api/generate-suggestions", {
        jobDescription: plainJobDesc,
        resumeText,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 402 || body.code === "QUOTA_EXCEEDED") throw Object.assign(new Error("quota"), { code: "QUOTA_EXCEEDED" });
        throw new Error(body.message ?? "Failed");
      }
      return res.json() as Promise<{ suggestions: Suggestion[]; missingKeywords: string[]; noAiKey: boolean }>;
    },
    onSuccess: (data) => {
      // Validate: filter suggestions whose currentText is still in the working resume
      const current = workingResume || (activeResume?.plainText ?? "");
      const valid = data.suggestions.filter(s => current.includes(s.currentText));
      setSuggestions(valid);
      setMissingKeywords(data.missingKeywords);
      setStatus(Object.fromEntries(valid.map(s => [s.id, "pending" as SuggestionStatus])));
      setNoApiKey(data.noAiKey);
    },
    onError: (error: any) => {
      if (error.code === "QUOTA_EXCEEDED") { setQuotaError(true); return; }
      toast({ title: "Could not generate suggestions.", description: error.message, variant: "destructive" });
    },
  });

  const saveResumeMutation = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error("No job");
      const res = await apiRequest("POST", "/api/resumes", {
        name: `Tailored – ${job.title} – ${job.company}`,
        roleType: job.roleClassification || job.title,
        plainText: workingResume,
        sourceType: "AI Tailored",
        jobId: job.id,
        active: false,
      });
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({ title: "Tailored resume saved to Resume Vault." });
    },
    onError: () => toast({ title: "Save failed.", variant: "destructive" }),
  });

  // ── Auto-start ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (job && activeResume?.plainText && !hasStarted && !quotaError) {
      setHasStarted(true);
      setWorkingResume(activeResume.plainText);
      suggestionMutation.mutate(activeResume.plainText);
    }
  }, [job, activeResume, hasStarted, quotaError]);

  // ── Accept ─────────────────────────────────────────────────────────────────
  const handleAccept = useCallback((suggestion: Suggestion) => {
    if (!workingResume.includes(suggestion.currentText)) {
      // Stale suggestion — regenerate immediately with current resume
      toast({ title: "Suggestion outdated — refreshing…" });
      setSuggestions([]);
      setStatus({});
      suggestionMutation.mutate(workingResume);
      return;
    }

    const newResume = workingResume.replace(suggestion.currentText, suggestion.suggestedText);

    // Save snapshot for undo
    setResumeHistory(prev => [...prev, workingResume]);
    setEditHistory(prev => [...prev, { keyword: suggestion.keyword, section: suggestion.section, resumeBefore: workingResume }]);
    setAcceptedKeywords(prev => [...new Set([...prev, suggestion.keyword])]);
    setWorkingResume(newResume);
    setSaved(false);

    // Clear stale suggestions immediately, then regenerate
    setSuggestions([]);
    setStatus({});

    // Fire both in parallel: fast score + AI suggestion refresh
    scoreMutation.mutate(newResume);
    suggestionMutation.mutate(newResume);
  }, [workingResume, plainJobDesc]);

  // ── Ignore (local — no regeneration needed) ────────────────────────────────
  const handleIgnore = useCallback((sid: string) => {
    setStatus(prev => ({ ...prev, [sid]: "ignored" }));
  }, []);

  const handleRestore = useCallback((sid: string) => {
    setStatus(prev => ({ ...prev, [sid]: "pending" }));
  }, []);

  // ── Undo last edit ─────────────────────────────────────────────────────────
  const handleUndoLast = useCallback(() => {
    if (resumeHistory.length === 0) return;

    const prevResume = resumeHistory[resumeHistory.length - 1];
    const lastEdit = editHistory[editHistory.length - 1];

    setWorkingResume(prevResume);
    setResumeHistory(prev => prev.slice(0, -1));
    setEditHistory(prev => prev.slice(0, -1));

    if (lastEdit) {
      setAcceptedKeywords(prev => {
        const idx = [...prev].reverse().indexOf(lastEdit.keyword);
        if (idx < 0) return prev;
        const realIdx = prev.length - 1 - idx;
        return [...prev.slice(0, realIdx), ...prev.slice(realIdx + 1)];
      });
    }

    setSaved(false);
    setSuggestions([]);
    setStatus({});

    // Refresh score + suggestions for reverted resume
    scoreMutation.mutate(prevResume);
    suggestionMutation.mutate(prevResume);
  }, [resumeHistory, editHistory, plainJobDesc]);

  // ── Keyword highlights (dynamic, based on current working resume) ───────────
  const { jdGreen, jdRed, resumeGreen } = useMemo(() => {
    const allJobKws = [...missingKeywords, ...(initialBreakdown?.matchedSkills ?? []), ...(initialBreakdown?.matchedRoleKeywords ?? [])];
    return {
      jdGreen: allJobKws.filter(k => kwPresent(workingResume, k)),
      jdRed: allJobKws.filter(k => !kwPresent(workingResume, k)),
      resumeGreen: acceptedKeywords,
    };
  }, [workingResume, missingKeywords, initialBreakdown, acceptedKeywords]);

  // ── Derived counts ─────────────────────────────────────────────────────────
  const pendingCount = Object.values(status).filter(s => s === "pending").length;
  const ignoredCount = Object.values(status).filter(s => s === "ignored").length;
  const totalEdits = editHistory.length;

  const displayBreakdown = liveBreakdown ?? initialBreakdown;
  const initialScore = initialBreakdown?.atsScore ?? 0;
  const currentScore = displayBreakdown?.atsScore ?? 0;
  const scoreDelta = liveBreakdown ? currentScore - initialScore : 0;

  const isRegenerating = suggestionMutation.isPending;

  // ── Copy ───────────────────────────────────────────────────────────────────
  const copyResume = () => {
    navigator.clipboard.writeText(workingResume).then(() => {
      setCopied(true);
      toast({ title: "Resume copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ─── Guards ────────────────────────────────────────────────────────────────
  if (jobLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className={`h-${i === 2 ? 32 : 10} w-full`} />)}
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Job not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/jobs")}>Back to Jobs</Button>
      </div>
    );
  }

  if (!activeResume?.plainText) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-3">
        <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">No resume with plain text found.</p>
        <Button variant="outline" onClick={() => navigate("/resumes")}>Go to Resume Vault</Button>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">

      {/* Back + Header */}
      <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1.5 -ml-1" data-testid="button-back">
        <ArrowLeft className="h-4 w-4" />Back to Job Detail
      </Button>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <h1 className="text-2xl font-semibold">Resume Optimization</h1>
          <Badge className="bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 ml-1">Interactive</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          <span className="font-medium text-foreground">{job.title}</span>
          <span className="mx-2">·</span>{job.company}
          {job.location && <><span className="mx-2">·</span>{job.location}</>}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 italic">
          Accept keyword edits one by one — suggestions refresh automatically after each acceptance
        </p>
      </div>

      {/* ATS Score Card */}
      <Card>
        <CardContent className="p-4">
          {atsLoading ? (
            <div className="flex gap-4"><Skeleton className="h-10 w-20" /><div className="flex-1 space-y-2"><Skeleton className="h-2 w-full" /><Skeleton className="h-2 w-4/5" /></div></div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Before → Now */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-center min-w-[56px]">
                  <p className="text-xs text-muted-foreground mb-0.5">Before</p>
                  <span className={`text-2xl font-bold ${scoreColor(initialScore)}`}>{initialScore}%</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="text-center min-w-[56px]">
                  <p className="text-xs text-muted-foreground mb-0.5">Now</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-2xl font-bold ${scoreColor(currentScore)}`}>{currentScore}%</span>
                    {scoreMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                </div>
                {scoreDelta !== 0 && (
                  <Badge className={`font-semibold text-sm px-2 ${scoreDelta > 0 ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"}`}>
                    {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                  </Badge>
                )}
              </div>

              <Separator orientation="vertical" className="hidden lg:block h-10 self-center" />

              {/* 4 bars */}
              {displayBreakdown && (
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-2.5 min-w-0">
                  <CategoryBar label="Technical Skills"   value={displayBreakdown.technicalSkillsPct} />
                  <CategoryBar label="Role Keywords"      value={displayBreakdown.roleKeywordsPct} />
                  <CategoryBar label="Domain Keywords"    value={displayBreakdown.domainKeywordsPct} />
                  <CategoryBar label="Phrase Alignment"   value={displayBreakdown.keywordAlignmentPct} />
                </div>
              )}

              <Separator orientation="vertical" className="hidden lg:block h-10 self-center" />

              {/* Edit history summary + undo */}
              <div className="shrink-0 min-w-[130px] space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">
                  {totalEdits > 0 ? `${totalEdits} edit${totalEdits !== 1 ? "s" : ""} applied` : "No edits yet"}
                </p>
                {totalEdits > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={handleUndoLast}
                    disabled={isRegenerating || scoreMutation.isPending}
                    data-testid="button-undo-last"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Undo last edit
                  </Button>
                )}
                {isRegenerating && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />Refreshing…
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Applied edit badges */}
      {editHistory.length > 0 && (
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Applied edits:</span>
          {editHistory.map((e, i) => (
            <Badge key={i} className="text-xs bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 gap-1">
              <CheckCircle className="h-3 w-3" />
              {e.keyword}
              <span className="text-green-500/70 dark:text-green-600 ml-0.5">· {e.section}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Quota error */}
      {quotaError && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="py-6 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
            <p className="font-medium mb-1">OpenAI API Quota Exceeded</p>
            <p className="text-sm text-muted-foreground">Add billing at <a href="https://platform.openai.com/account/billing" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">platform.openai.com/account/billing</a>.</p>
          </CardContent>
        </Card>
      )}

      {/* 2-column: Job Description | Working Resume */}
      {!quotaError && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Left: Job Description */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />Job Description
              </CardTitle>
              <div className="flex items-center justify-between flex-wrap gap-1">
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-700 dark:text-green-400 font-medium">Green</span> = in resume ·{" "}
                  <span className="text-red-600 dark:text-red-400 font-medium">Red</span> = still missing
                </p>
                {plainJobDesc.length > 0 && (
                  <p className="text-xs text-muted-foreground" data-testid="jd-stats">
                    {plainJobDesc.length.toLocaleString()} chars
                    {jdSectionCount > 0 && (
                      <> · {jdSectionCount} section{jdSectionCount !== 1 ? "s" : ""} detected</>
                    )}
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-[480px] overflow-y-auto pr-1" data-testid="panel-job-description">
                {renderLines(plainJobDesc, jdGreen, jdRed)}
              </div>
            </CardContent>
          </Card>

          {/* Right: Working Resume */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-violet-500" />Working Resume
                    {totalEdits > 0 && (
                      <Badge className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 text-xs">
                        {totalEdits} edit{totalEdits !== 1 ? "s" : ""} applied
                      </Badge>
                    )}
                  </CardTitle>
                  {totalEdits > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="text-green-700 dark:text-green-400 font-medium">Green</span> = newly accepted keywords
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={copyResume} className="gap-1.5 text-xs h-7" data-testid="button-copy-resume">
                  {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="bg-muted/30 border rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-[480px] overflow-y-auto" data-testid="text-working-resume">
                {renderLines(workingResume, resumeGreen, [])}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Suggestions panel */}
      {!quotaError && (
        <div className="space-y-3">

          {/* Panel header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              Suggested Keyword Improvements
              {isRegenerating && (
                <span className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {totalEdits > 0 ? "Refreshing after edit…" : "Analyzing…"}
                </span>
              )}
              {!isRegenerating && suggestions.length > 0 && (
                <Badge variant="secondary" className="text-xs">{pendingCount} remaining</Badge>
              )}
            </h2>
            {!isRegenerating && suggestions.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => { setSuggestions([]); setStatus({}); suggestionMutation.mutate(workingResume); }}
                disabled={isRegenerating}
                data-testid="button-refresh-suggestions"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            )}
            {noApiKey && !isRegenerating && (
              <p className="text-xs text-muted-foreground italic">Add an OpenAI API key to get AI suggestions</p>
            )}
          </div>

          {/* Loading skeletons */}
          {isRegenerating && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="border-dashed">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex gap-2"><Skeleton className="h-5 w-24 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" /></div>
                    <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" />
                    <div className="flex gap-2 pt-1"><Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-16" /></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* All done / no suggestions */}
          {!isRegenerating && suggestions.length === 0 && !noApiKey && !quotaError && hasStarted && (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-sm font-medium">
                  {totalEdits > 0 ? "No more improvements found — your resume is well-optimized!" : "Your resume is already well-aligned with this job."}
                </p>
                {totalEdits === 0 && <p className="text-xs text-muted-foreground mt-1">No additional keyword improvements were identified.</p>}
              </CardContent>
            </Card>
          )}

          {/* Suggestion cards */}
          {!isRegenerating && suggestions.map(s => {
            const st = status[s.id] ?? "pending";
            const isPending = st === "pending";
            const isIgnored = st === "ignored";
            const sectionCls = SECTION_COLORS[s.section] ?? SECTION_COLORS.experience;

            return (
              <Card
                key={s.id}
                className={`transition-all duration-150 ${isIgnored ? "opacity-45" : ""}`}
                data-testid={`card-suggestion-${s.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {isPending && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                      {isIgnored && <Minus className="h-4 w-4 text-muted-foreground/50" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Tags */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className="bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 text-xs font-semibold" data-testid={`badge-keyword-${s.id}`}>
                          {s.keyword}
                        </Badge>
                        <Badge variant="outline" className={`text-xs border ${sectionCls}`} data-testid={`badge-section-${s.id}`}>
                          {s.section}
                        </Badge>
                        {isIgnored && <span className="text-xs text-muted-foreground">Skipped</span>}
                      </div>

                      {/* Current → Suggested diff */}
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-start mb-2">
                        <div className="text-xs font-mono p-2 rounded border bg-muted/40 leading-relaxed" data-testid={`text-current-${s.id}`}>
                          {s.currentText}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2 hidden md:block" />
                        <div className="text-xs font-mono p-2 rounded border bg-muted/40 leading-relaxed" data-testid={`text-suggested-${s.id}`}>
                          {renderLines(s.suggestedText, [s.keyword], [])}
                        </div>
                      </div>

                      {/* Reason */}
                      <p className="text-xs text-muted-foreground italic mb-3" data-testid={`text-reason-${s.id}`}>
                        {s.reason}
                      </p>

                      {/* Buttons */}
                      <div className="flex items-center gap-2">
                        {isPending && (
                          <>
                            <Button
                              size="sm"
                              className="h-7 gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleAccept(s)}
                              disabled={isRegenerating}
                              data-testid={`button-accept-${s.id}`}
                            >
                              <Check className="h-3.5 w-3.5" />Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1.5 text-xs text-muted-foreground"
                              onClick={() => handleIgnore(s.id)}
                              data-testid={`button-ignore-${s.id}`}
                            >
                              <Minus className="h-3.5 w-3.5" />Ignore
                            </Button>
                          </>
                        )}
                        {isIgnored && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 text-xs text-muted-foreground"
                            onClick={() => handleRestore(s.id)}
                            data-testid={`button-restore-${s.id}`}
                          >
                            Restore
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Missing keywords (no API key) */}
          {noApiKey && missingKeywords.length > 0 && !isRegenerating && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4 text-amber-500" />Missing Keywords Detected
                </CardTitle>
                <p className="text-xs text-muted-foreground">Add an OpenAI API key to get specific edit suggestions.</p>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex flex-wrap gap-1.5">
                  {missingKeywords.map(k => (
                    <Badge key={k} className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">{k}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2 pb-4">
        <Button variant="outline" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1.5" data-testid="button-bottom-back">
          <ArrowLeft className="h-4 w-4" />Back to Job Detail
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyResume} data-testid="button-copy-bottom">
            <Copy className="h-4 w-4" />{copied ? "Copied!" : "Copy Resume"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-export">
                <Download className="h-4 w-4" />Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { exportTxt(workingResume, `${job.title}_${job.company}`); toast({ title: "Exported TXT." }); }} data-testid="menu-export-txt">Export TXT</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { exportDoc(workingResume, `${job.title}_${job.company}`); toast({ title: "Exported DOC." }); }} data-testid="menu-export-doc">Export DOC</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { exportPdf(workingResume, `${job.title}_${job.company}`); toast({ title: "Exported PDF." }); }} data-testid="menu-export-pdf">Export PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => saveResumeMutation.mutate()}
            disabled={saveResumeMutation.isPending || saved || totalEdits === 0}
            data-testid="button-save-resume"
          >
            {saved
              ? <><CheckCircle className="h-4 w-4" />Saved to Vault</>
              : saveResumeMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
              : <><Save className="h-4 w-4" />{totalEdits > 0 ? `Save (${totalEdits} edit${totalEdits !== 1 ? "s" : ""})` : "Save (accept edits first)"}</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
