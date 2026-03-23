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
  ArrowLeft,
  Sparkles,
  CheckCircle,
  XCircle,
  Copy,
  Target,
  FileText,
  AlertCircle,
  Download,
  Save,
  ArrowRight,
  Info,
  Check,
  Minus,
  RotateCcw,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { exportTxt, exportDoc, exportPdf } from "@/lib/export-resume";
import type { Job, Resume } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────
interface Suggestion {
  id: string;
  keyword: string;
  section: "skills" | "experience" | "projects" | "summary";
  currentText: string;
  suggestedText: string;
  reason: string;
}

interface ScoreBreakdown {
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

type SuggestionStatus = "pending" | "accepted" | "ignored" | "invalid";

// ─── Helpers ──────────────────────────────────────────────────────

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function kwPresent(text: string, kw: string): boolean {
  const escaped = escapeRegex(kw);
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(text);
}

function highlightText(
  text: string,
  greenKws: string[],
  redKws: string[]
): React.ReactNode[] {
  if (!text || (greenKws.length === 0 && redKws.length === 0)) return [text];

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
        <mark key={m.index} className="bg-green-200 dark:bg-green-900/70 text-green-900 dark:text-green-200 rounded-sm px-0.5 not-italic font-semibold">
          {m[0]}
        </mark>
      );
    } else if (redSet.has(lower)) {
      parts.push(
        <mark key={m.index} className="bg-red-200 dark:bg-red-900/70 text-red-900 dark:text-red-200 rounded-sm px-0.5 not-italic font-medium">
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

function renderMultiline(text: string, green: string[], red: string[]): React.ReactNode {
  return text.split("\n").map((line, i, arr) => (
    <span key={i}>
      {highlightText(line, green, red)}
      {i < arr.length - 1 && "\n"}
    </span>
  ));
}

function scoreColor(s: number) {
  if (s >= 70) return "text-green-700 dark:text-green-400";
  if (s >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function barColor(s: number) {
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
      <Progress value={value} className={`h-1.5 ${barColor(value)}`} />
    </div>
  );
}

const SECTION_COLORS: Record<string, string> = {
  skills: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  experience: "bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  projects: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  summary: "bg-teal-100 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
};

// ─── Component ────────────────────────────────────────────────────
export default function JobOptimize() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const jobId = parseInt(id);

  // Working resume = original + accepted edits
  const [workingResume, setWorkingResume] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [missingKeywords, setMissingKeywords] = useState<string[]>([]);
  const [status, setStatus] = useState<Record<string, SuggestionStatus>>({});
  const [acceptedKeywords, setAcceptedKeywords] = useState<string[]>([]);
  const [liveBreakdown, setLiveBreakdown] = useState<ScoreBreakdown | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const [noApiKey, setNoApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────
  const { data: job, isLoading: jobLoading } = useQuery<Job>({ queryKey: ["/api/jobs", jobId] });
  const { data: resumes } = useQuery<Resume[]>({ queryKey: ["/api/resumes"] });
  const { data: initialBreakdown, isLoading: atsLoading } = useQuery<ScoreBreakdown>({
    queryKey: ["/api/jobs", jobId, "ats-breakdown"],
    enabled: !!job,
  });

  const activeResume = resumes?.find(r => r.active) ?? resumes?.[0];

  // ── Mutations ────────────────────────────────────────────────────
  const suggestionMutation = useMutation({
    mutationFn: async ({ jobDescription, resumeText }: { jobDescription: string; resumeText: string }) => {
      const res = await apiRequest("POST", "/api/generate-suggestions", { jobDescription, resumeText });
      return res.json() as Promise<{ suggestions: Suggestion[]; missingKeywords: string[]; noAiKey: boolean }>;
    },
    onSuccess: (data) => {
      setSuggestions(data.suggestions);
      setMissingKeywords(data.missingKeywords);
      setStatus(Object.fromEntries(data.suggestions.map(s => [s.id, "pending" as SuggestionStatus])));
      setNoApiKey(data.noAiKey);
    },
    onError: (error: any) => {
      const msg: string = error?.message ?? "";
      if (msg.startsWith("402") || msg.includes("quota") || msg.includes("QUOTA_EXCEEDED")) {
        setQuotaError(true);
      } else {
        toast({ title: "Could not generate suggestions.", description: msg, variant: "destructive" });
      }
    },
  });

  const scoreMutation = useMutation({
    mutationFn: async ({ resumeText, jobDescription }: { resumeText: string; jobDescription: string }) => {
      const res = await apiRequest("POST", "/api/ats-score", { resumeText, jobDescription });
      return res.json() as Promise<ScoreBreakdown>;
    },
    onSuccess: (data) => setLiveBreakdown(data),
  });

  const saveResumeMutation = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error("No job");
      const name = `Tailored – ${job.title} – ${job.company}`;
      const res = await apiRequest("POST", "/api/resumes", {
        name,
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

  // ── Auto-start ────────────────────────────────────────────────────
  const plainJobDesc = useMemo(
    () => (job?.description ? stripHtml(job.description) : job?.title ?? ""),
    [job]
  );

  useEffect(() => {
    if (job && activeResume?.plainText && !hasStarted && !quotaError) {
      setHasStarted(true);
      setWorkingResume(activeResume.plainText);
      suggestionMutation.mutate({ jobDescription: plainJobDesc, resumeText: activeResume.plainText });
    }
  }, [job, activeResume, hasStarted, quotaError, plainJobDesc]);

  // ── Accept / Ignore ───────────────────────────────────────────────
  const handleAccept = useCallback((suggestion: Suggestion) => {
    if (!workingResume.includes(suggestion.currentText)) {
      setStatus(prev => ({ ...prev, [suggestion.id]: "invalid" }));
      toast({ title: "Could not apply suggestion", description: "The original text was already modified.", variant: "destructive" });
      return;
    }
    const newResume = workingResume.replace(suggestion.currentText, suggestion.suggestedText);
    setWorkingResume(newResume);
    setStatus(prev => ({ ...prev, [suggestion.id]: "accepted" }));
    setAcceptedKeywords(prev => [...new Set([...prev, suggestion.keyword])]);
    setSaved(false);
    scoreMutation.mutate({ resumeText: newResume, jobDescription: plainJobDesc });
  }, [workingResume, plainJobDesc]);

  const handleIgnore = useCallback((id: string) => {
    setStatus(prev => ({ ...prev, [id]: "ignored" }));
  }, []);

  const handleUndo = useCallback((suggestion: Suggestion) => {
    if (!workingResume.includes(suggestion.suggestedText)) {
      setStatus(prev => ({ ...prev, [suggestion.id]: "pending" }));
      return;
    }
    const newResume = workingResume.replace(suggestion.suggestedText, suggestion.currentText);
    setWorkingResume(newResume);
    setStatus(prev => ({ ...prev, [suggestion.id]: "pending" }));
    setAcceptedKeywords(prev => prev.filter(k => k !== suggestion.keyword));
    setSaved(false);
    scoreMutation.mutate({ resumeText: newResume, jobDescription: plainJobDesc });
  }, [workingResume, plainJobDesc]);

  // ── Dynamic highlight keywords ────────────────────────────────────
  const { jdGreen, jdRed, resumeGreen } = useMemo(() => {
    const allJobKws = [...missingKeywords, ...(initialBreakdown?.matchedSkills ?? [])];
    const jdGreen = allJobKws.filter(k => kwPresent(workingResume, k));
    const jdRed = allJobKws.filter(k => !kwPresent(workingResume, k));
    const resumeGreen = acceptedKeywords;
    return { jdGreen, jdRed, resumeGreen };
  }, [workingResume, missingKeywords, initialBreakdown, acceptedKeywords]);

  // ── Progress counters ─────────────────────────────────────────────
  const acceptedCount = Object.values(status).filter(s => s === "accepted").length;
  const ignoredCount = Object.values(status).filter(s => s === "ignored").length;
  const pendingCount = Object.values(status).filter(s => s === "pending").length;

  // ── Score display ─────────────────────────────────────────────────
  const displayBreakdown = liveBreakdown ?? initialBreakdown;
  const initialScore = initialBreakdown?.atsScore ?? 0;
  const currentScore = displayBreakdown?.atsScore ?? 0;
  const scoreDelta = liveBreakdown ? currentScore - initialScore : 0;

  // ── Copy ──────────────────────────────────────────────────────────
  const copyResume = () => {
    navigator.clipboard.writeText(workingResume).then(() => {
      setCopied(true);
      toast({ title: "Resume copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ─── Render ────────────────────────────────────────────────────────
  if (jobLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-32 w-full mt-4" />
        <Skeleton className="h-96 w-full" />
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
        <p className="text-muted-foreground">No resume with plain text found. Add one in Resume Vault first.</p>
        <Button variant="outline" onClick={() => navigate("/resumes")}>Go to Resume Vault</Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">

      {/* ── Back + Header ─────────────────────────────────────────── */}
      <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1.5 -ml-1" data-testid="button-back-to-job">
        <ArrowLeft className="h-4 w-4" />
        Back to Job Detail
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
        <p className="text-xs text-muted-foreground mt-0.5">
          Resume: <span className="font-medium text-foreground">{initialBreakdown?.resumeName ?? activeResume?.name ?? "—"}</span>
          <span className="mx-2 text-muted-foreground/40">·</span>
          <span className="italic">Accept suggestions one by one — your original resume is never modified</span>
        </p>
      </div>

      {/* ── ATS Score Card ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          {atsLoading ? (
            <div className="flex gap-4 items-center">
              <Skeleton className="h-10 w-20" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-4/5" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Score */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-center min-w-[60px]">
                  <p className="text-xs text-muted-foreground mb-0.5">Before</p>
                  <span className={`text-2xl font-bold ${scoreColor(initialScore)}`}>{initialScore}%</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="text-center min-w-[60px]">
                  <p className="text-xs text-muted-foreground mb-0.5">Now</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-2xl font-bold ${scoreColor(currentScore)}`}>{currentScore}%</span>
                    {scoreMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                </div>
                {scoreDelta !== 0 && (
                  <Badge className={`font-semibold text-sm ${scoreDelta > 0 ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"}`}>
                    {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                  </Badge>
                )}
              </div>

              <Separator orientation="vertical" className="hidden lg:block h-10 self-center" />

              {/* 4-category bars */}
              {displayBreakdown && (
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-2.5 min-w-0">
                  <CategoryBar label="Technical Skills" value={displayBreakdown.technicalSkillsPct} />
                  <CategoryBar label="Role Keywords" value={displayBreakdown.roleKeywordsPct} />
                  <CategoryBar label="Domain Keywords" value={displayBreakdown.domainKeywordsPct} />
                  <CategoryBar label="Keyword Alignment" value={displayBreakdown.keywordAlignmentPct} />
                </div>
              )}

              <Separator orientation="vertical" className="hidden lg:block h-10 self-center" />

              {/* Suggestions progress */}
              <div className="shrink-0 flex flex-col gap-1 min-w-[120px]">
                <p className="text-xs text-muted-foreground font-medium">Suggestions</p>
                <div className="flex gap-2 text-xs">
                  <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
                    <CheckCircle className="h-3 w-3" />{acceptedCount} accepted
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Minus className="h-3 w-3" />{ignoredCount} ignored
                  </span>
                </div>
                {pendingCount > 0 && (
                  <p className="text-xs text-muted-foreground">{pendingCount} remaining</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quota error */}
      {quotaError && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="py-6 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
            <p className="font-medium mb-1">OpenAI API Quota Exceeded</p>
            <p className="text-sm text-muted-foreground mb-3">Add billing at <a href="https://platform.openai.com/account/billing" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">platform.openai.com/account/billing</a>.</p>
          </CardContent>
        </Card>
      )}

      {/* ── 2-Column: Job Description | Working Resume ───────────── */}
      {!quotaError && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Left: Job Description */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Job Description
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                <span className="text-green-700 dark:text-green-400 font-medium">Green</span> = present in resume ·{" "}
                <span className="text-red-600 dark:text-red-400 font-medium">Red</span> = still missing
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto pr-1" data-testid="panel-job-description">
                {renderMultiline(plainJobDesc, jdGreen, jdRed)}
              </div>
            </CardContent>
          </Card>

          {/* Right: Working Resume */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-violet-500" />
                    Working Resume
                    {acceptedCount > 0 && (
                      <Badge className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 text-xs">
                        {acceptedCount} edit{acceptedCount !== 1 ? "s" : ""} applied
                      </Badge>
                    )}
                  </CardTitle>
                  {acceptedCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="text-green-700 dark:text-green-400 font-medium">Green</span> = newly accepted keywords
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={copyResume} className="gap-1.5 text-xs h-7" data-testid="button-copy-working-resume">
                  {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div
                className="bg-muted/30 border rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto"
                data-testid="text-working-resume"
              >
                {renderMultiline(workingResume, resumeGreen, [])}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Suggestion Cards ──────────────────────────────────────── */}
      {!quotaError && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              Suggested Keyword Improvements
              {suggestionMutation.isPending && (
                <span className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />Analyzing…
                </span>
              )}
              {!suggestionMutation.isPending && suggestions.length > 0 && (
                <Badge variant="secondary" className="text-xs">{suggestions.length} found</Badge>
              )}
            </h2>
            {noApiKey && !suggestionMutation.isPending && (
              <p className="text-xs text-muted-foreground italic">Add an OpenAI API key to get AI suggestions</p>
            )}
          </div>

          {/* Loading skeletons */}
          {suggestionMutation.isPending && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="border-dashed">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-24 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-3/4" />
                    <div className="flex gap-2 pt-1">
                      <Skeleton className="h-7 w-20" />
                      <Skeleton className="h-7 w-16" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* No suggestions */}
          {!suggestionMutation.isPending && suggestions.length === 0 && !noApiKey && !quotaError && (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-sm font-medium">Your resume is already well-aligned</p>
                <p className="text-xs text-muted-foreground mt-1">No additional keyword improvements were found.</p>
              </CardContent>
            </Card>
          )}

          {/* Suggestion list */}
          {!suggestionMutation.isPending && suggestions.map(suggestion => {
            const s = status[suggestion.id] ?? "pending";
            const isAccepted = s === "accepted";
            const isIgnored = s === "ignored";
            const isInvalid = s === "invalid";
            const isPending = s === "pending";
            const sectionColor = SECTION_COLORS[suggestion.section] ?? SECTION_COLORS.experience;

            return (
              <Card
                key={suggestion.id}
                className={`transition-all duration-200 ${isAccepted ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10" : isIgnored ? "opacity-50" : isInvalid ? "border-red-200 dark:border-red-800" : ""}`}
                data-testid={`card-suggestion-${suggestion.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className="mt-0.5 shrink-0">
                      {isAccepted && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {isIgnored && <Minus className="h-4 w-4 text-muted-foreground" />}
                      {isInvalid && <XCircle className="h-4 w-4 text-red-500" />}
                      {isPending && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Tags */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge className="bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 text-xs font-semibold" data-testid={`badge-keyword-${suggestion.id}`}>
                          {suggestion.keyword}
                        </Badge>
                        <Badge variant="outline" className={`text-xs border ${sectionColor}`} data-testid={`badge-section-${suggestion.id}`}>
                          {suggestion.section}
                        </Badge>
                        {isAccepted && <span className="text-xs text-green-600 dark:text-green-400 font-medium">Applied ✓</span>}
                        {isIgnored && <span className="text-xs text-muted-foreground">Skipped</span>}
                        {isInvalid && <span className="text-xs text-red-600 dark:text-red-400">Conflict — text already modified</span>}
                      </div>

                      {/* Current → Suggested */}
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-start mb-2">
                        <div className={`text-xs font-mono p-2 rounded border leading-relaxed ${isAccepted ? "line-through opacity-50 bg-muted/50" : "bg-muted/40 border-border"}`} data-testid={`text-current-${suggestion.id}`}>
                          {suggestion.currentText}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2 hidden md:block" />
                        <div className={`text-xs font-mono p-2 rounded border leading-relaxed ${isAccepted ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-muted/40 border-border"}`} data-testid={`text-suggested-${suggestion.id}`}>
                          {renderMultiline(suggestion.suggestedText, [suggestion.keyword], [])}
                        </div>
                      </div>

                      {/* Reason */}
                      <p className="text-xs text-muted-foreground italic mb-3" data-testid={`text-reason-${suggestion.id}`}>
                        {suggestion.reason}
                      </p>

                      {/* Buttons */}
                      <div className="flex items-center gap-2">
                        {isPending && (
                          <>
                            <Button
                              size="sm"
                              className="h-7 gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleAccept(suggestion)}
                              data-testid={`button-accept-${suggestion.id}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1.5 text-xs text-muted-foreground"
                              onClick={() => handleIgnore(suggestion.id)}
                              data-testid={`button-ignore-${suggestion.id}`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                              Ignore
                            </Button>
                          </>
                        )}
                        {isAccepted && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 text-xs text-muted-foreground"
                            onClick={() => handleUndo(suggestion)}
                            data-testid={`button-undo-${suggestion.id}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Undo
                          </Button>
                        )}
                        {isIgnored && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 text-xs text-muted-foreground"
                            onClick={() => setStatus(prev => ({ ...prev, [suggestion.id]: "pending" }))}
                            data-testid={`button-restore-${suggestion.id}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
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

          {/* Missing keywords (when no API key) */}
          {noApiKey && missingKeywords.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4 text-amber-500" />
                  Missing Keywords Detected
                </CardTitle>
                <p className="text-xs text-muted-foreground">Add an OpenAI API key to get specific edit suggestions for each of these.</p>
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

      {/* ── Action bar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2 pb-4">
        <Button variant="outline" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1.5" data-testid="button-bottom-back">
          <ArrowLeft className="h-4 w-4" />
          Back to Job Detail
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyResume} data-testid="button-copy-bottom">
            <Copy className="h-4 w-4" />
            {copied ? "Copied!" : "Copy Resume"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-export">
                <Download className="h-4 w-4" />
                Export
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
            disabled={saveResumeMutation.isPending || saved || acceptedCount === 0}
            data-testid="button-save-resume"
          >
            {saved
              ? <><CheckCircle className="h-4 w-4" />Saved to Vault</>
              : saveResumeMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
              : <><Save className="h-4 w-4" />Save {acceptedCount > 0 ? `(${acceptedCount} edit${acceptedCount !== 1 ? "s" : ""})` : "(accept edits first)"}</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
