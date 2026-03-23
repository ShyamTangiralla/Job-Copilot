import { useEffect, useState, useMemo } from "react";
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
  Shield,
  Layers,
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

interface ScoreBreakdown {
  technicalSkillsPct: number;
  roleKeywordsPct: number;
  domainKeywordsPct: number;
  keywordAlignmentPct: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchedRoleKeywords: string[];
  missingRoleKeywords: string[];
}

interface ATSBreakdown extends ScoreBreakdown {
  atsScore: number;
  resumeName?: string | null;
}

interface OptimizeResult {
  tailoredResume?: string;
  missingKeywords: string[];
  skillsToHighlight: string[];
  addedKeywords: string[];
  stillMissingKeywords: string[];
  beforeScore: number;
  afterScore: number;
  afterScoreBreakdown?: ScoreBreakdown;
  usedEnrichmentPass?: boolean;
  improvedSummary?: string;
  improvedBullets?: { original: string; improved: string; reason: string }[];
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlight keywords in text using whole-word / whole-phrase matching.
 *
 * The regex uses negative lookbehind/lookahead for [a-z0-9] so that
 * short terms like "r" (R language) are never matched inside longer
 * words like "for", "result", "order", etc.
 *
 * Returns an array of React nodes — plain strings and <mark> spans.
 */
function highlightText(
  text: string,
  greenKws: string[],
  redKws: string[]
): React.ReactNode[] {
  if (!text || (greenKws.length === 0 && redKws.length === 0)) return [text];

  // Sort longest first so multi-word phrases are matched before sub-phrases
  const allKws = [
    ...greenKws.map(k => ({ kw: k, color: "green" as const })),
    ...redKws.map(k => ({ kw: k, color: "red" as const })),
  ].sort((a, b) => b.kw.length - a.kw.length);

  // Build single alternation regex with phrase-boundary guards
  const alternation = allKws.map(k => escapeRegex(k.kw)).join("|");
  const regex = new RegExp(`(?<![a-z0-9])(${alternation})(?![a-z0-9])`, "gi");

  // Build lookup for fast color detection
  const greenSet = new Set(greenKws.map(k => k.toLowerCase()));
  const redSet = new Set(redKws.map(k => k.toLowerCase()));

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push preceding text segment
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const matched = match[0];
    const lower = matched.toLowerCase();

    if (greenSet.has(lower)) {
      parts.push(
        <mark
          key={match.index}
          className="bg-green-200 dark:bg-green-900/70 text-green-900 dark:text-green-200 rounded-sm px-0.5 not-italic font-semibold"
        >
          {matched}
        </mark>
      );
    } else if (redSet.has(lower)) {
      parts.push(
        <mark
          key={match.index}
          className="bg-red-200 dark:bg-red-900/70 text-red-900 dark:text-red-200 rounded-sm px-0.5 not-italic font-medium"
        >
          {matched}
        </mark>
      );
    } else {
      parts.push(matched);
    }

    lastIndex = regex.lastIndex;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function renderHighlightedMultiline(
  text: string,
  greenKws: string[],
  redKws: string[]
): React.ReactNode {
  return text.split("\n").map((line, i, arr) => (
    <span key={i}>
      {highlightText(line, greenKws, redKws)}
      {i < arr.length - 1 && "\n"}
    </span>
  ));
}

// ─────────────────────────────────────────────────────────────────
// Score helpers
// ─────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 70) return "text-green-700 dark:text-green-400";
  if (score >= 40) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function scoreProgressColor(score: number): string {
  if (score >= 70) return "[&>div]:bg-green-500";
  if (score >= 40) return "[&>div]:bg-yellow-500";
  return "[&>div]:bg-red-500";
}

function CategoryBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold">{value}%</span>
      </div>
      <Progress value={value} className={`h-1.5 ${scoreProgressColor(value)}`} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export default function JobOptimize() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const jobId = parseInt(id);

  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [copied, setCopied] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: job, isLoading: jobLoading } = useQuery<Job>({
    queryKey: ["/api/jobs", jobId],
  });

  const { data: resumes } = useQuery<Resume[]>({
    queryKey: ["/api/resumes"],
  });

  const { data: atsBreakdown, isLoading: atsLoading } = useQuery<ATSBreakdown>({
    queryKey: ["/api/jobs", jobId, "ats-breakdown"],
    enabled: !!job,
  });

  const activeResume = resumes?.find(r => r.active) ?? resumes?.[0];

  const optimizeMutation = useMutation({
    mutationFn: async (payload: { jobDescription: string; resumeText: string }) => {
      const res = await apiRequest("POST", "/api/optimize-resume", payload);
      return res.json() as Promise<OptimizeResult>;
    },
    onSuccess: (result) => {
      setOptimizeResult(result);
    },
    onError: (error: any) => {
      const msg: string = error?.message ?? "";
      if (msg.startsWith("402") || msg.includes("quota") || msg.includes("QUOTA_EXCEEDED")) {
        setQuotaError(true);
      } else {
        toast({ title: "Optimization failed", description: "Could not generate suggestions. Please try again.", variant: "destructive" });
      }
    },
  });

  const saveResumeMutation = useMutation({
    mutationFn: async () => {
      if (!optimizeResult?.tailoredResume || !job) throw new Error("No tailored resume to save");
      const name = `Tailored – ${job.title} – ${job.company}`;
      const res = await apiRequest("POST", "/api/resumes", {
        name,
        roleType: job.roleClassification || job.title,
        plainText: optimizeResult.tailoredResume,
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
    onError: () => {
      toast({ title: "Save failed", description: "Could not save resume.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (job && activeResume?.plainText && !hasRun && !optimizeMutation.isPending && !quotaError) {
      setHasRun(true);
      const jobDescription = job.description ? stripHtml(job.description) : job.title;
      optimizeMutation.mutate({ jobDescription, resumeText: activeResume.plainText });
    }
  }, [job, activeResume, hasRun, quotaError]);

  const copyTailoredResume = () => {
    const text = optimizeResult?.tailoredResume;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: "Tailored resume copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isLoading = jobLoading || optimizeMutation.isPending;

  const plainJobDesc = useMemo(
    () => (job?.description ? stripHtml(job.description) : job?.title ?? ""),
    [job]
  );

  const hasResults = !!optimizeResult?.tailoredResume;
  const beforeScore = optimizeResult?.beforeScore ?? atsBreakdown?.atsScore ?? job?.atsScore ?? 0;
  const afterScore = optimizeResult?.afterScore ?? 0;
  const scoreDelta = hasResults ? afterScore - beforeScore : 0;

  // Keywords to highlight in each panel
  const jdGreenKws = useMemo(
    () => hasResults ? [...(optimizeResult?.skillsToHighlight ?? []), ...(optimizeResult?.addedKeywords ?? [])] : [],
    [optimizeResult, hasResults]
  );
  const jdRedKws = useMemo(
    () => hasResults ? (optimizeResult?.stillMissingKeywords ?? []) : [],
    [optimizeResult, hasResults]
  );
  const resumeGreenKws = useMemo(
    () => hasResults ? [...(optimizeResult?.skillsToHighlight ?? []), ...(optimizeResult?.addedKeywords ?? [])] : [],
    [optimizeResult, hasResults]
  );

  // ─────────────────────────────────────────────────────────────────
  // Loading state
  // ─────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* Back */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1.5" data-testid="button-back-to-job">
          <ArrowLeft className="h-4 w-4" />
          Back to Job Detail
        </Button>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <h1 className="text-2xl font-semibold">Resume Optimization</h1>
        </div>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{job.title}</span>
          <span className="mx-2">·</span>
          {job.company}
          {job.location && <><span className="mx-2">·</span>{job.location}</>}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Resume: <span className="font-medium text-foreground">{atsBreakdown?.resumeName ?? activeResume?.name ?? "—"}</span>
          <span className="mx-2 text-muted-foreground/50">·</span>
          <span className="italic">Suggestions only — your original resume is never changed</span>
        </p>
      </div>

      {/* ── ATS Score Card ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          {hasResults ? (
            /* Before → After with delta and category bars */
            <div className="flex flex-col lg:flex-row lg:items-start gap-5">
              {/* Scores */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Before</p>
                  <span className={`text-3xl font-bold ${scoreColor(beforeScore)}`}>{beforeScore}%</span>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground mt-1" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">After</p>
                  <span className={`text-3xl font-bold ${scoreColor(afterScore)}`}>{afterScore}%</span>
                </div>
                {scoreDelta !== 0 && (
                  <Badge
                    className={`text-sm font-semibold self-center ${scoreDelta > 0
                      ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                      : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"}`}
                    data-testid="badge-score-delta"
                  >
                    {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                  </Badge>
                )}
              </div>

              <Separator orientation="vertical" className="hidden lg:block self-stretch" />

              {/* Category breakdown bars */}
              {optimizeResult?.afterScoreBreakdown && (
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-3 min-w-0">
                  <CategoryBar label="Technical Skills" value={optimizeResult.afterScoreBreakdown.technicalSkillsPct} />
                  <CategoryBar label="Role Keywords" value={optimizeResult.afterScoreBreakdown.roleKeywordsPct} />
                  <CategoryBar label="Domain Keywords" value={optimizeResult.afterScoreBreakdown.domainKeywordsPct} />
                  <CategoryBar label="Keyword Alignment" value={optimizeResult.afterScoreBreakdown.keywordAlignmentPct} />
                </div>
              )}

              <Separator orientation="vertical" className="hidden lg:block self-stretch" />

              {/* Keyword stats */}
              <div className="grid grid-cols-3 lg:grid-cols-1 gap-2 shrink-0 text-center lg:text-left">
                <div className="lg:flex lg:items-center lg:gap-2">
                  <Badge className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 text-xs font-bold" data-testid="badge-keywords-added">
                    +{optimizeResult.addedKeywords.length} added
                  </Badge>
                </div>
                <div>
                  <Badge className={`text-xs font-bold ${optimizeResult.stillMissingKeywords.length === 0 ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" : "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"}`} data-testid="badge-still-missing">
                    {optimizeResult.stillMissingKeywords.length} missing
                  </Badge>
                </div>
                <div>
                  <Badge className="bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-xs font-bold" data-testid="badge-highlighted">
                    {optimizeResult.skillsToHighlight.length} matched
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            /* Pre-optimization: show current breakdown */
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">ATS Match Score</span>
                  </div>
                  {atsLoading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <span className={`text-xl font-bold ${scoreColor(beforeScore)}`}>{beforeScore}%</span>
                  )}
                </div>
                <Progress value={beforeScore} className={`h-2.5 ${scoreProgressColor(beforeScore)}`} />
              </div>
              {atsBreakdown && !atsLoading && (
                <>
                  <Separator orientation="vertical" className="hidden sm:block h-12" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                    <CategoryBar label="Tech Skills" value={atsBreakdown.technicalSkillsPct} />
                    <CategoryBar label="Role KW" value={atsBreakdown.roleKeywordsPct} />
                    <CategoryBar label="Domain" value={atsBreakdown.domainKeywordsPct} />
                    <CategoryBar label="Alignment" value={atsBreakdown.keywordAlignmentPct} />
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Optimization pass note */}
      {hasResults && (
        <div
          className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 border ${
            optimizeResult.usedEnrichmentPass
              ? "bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300"
              : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
          }`}
          data-testid="note-optimization-pass"
        >
          {optimizeResult.usedEnrichmentPass ? (
            <Layers className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <Shield className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <span>
            {optimizeResult.usedEnrichmentPass
              ? <><strong>Safe enrichment pass used.</strong> After the first pass, a second pass added adjacent skills and domain context (coursework, training, tools) to raise keyword coverage. No fake experience was added.</>
              : <><strong>Truthful-only optimization used.</strong> All keyword insertions are directly supported by your existing experience, skills, and projects.</>
            }
          </span>
        </div>
      )}

      {/* Score improvement note */}
      {hasResults && scoreDelta < 15 && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3" data-testid="note-limited-optimization">
          <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <span>Optimization was limited by truthfulness and available experience. Keywords not added are shown in <span className="text-red-600 dark:text-red-400 font-medium">red</span> in the job description panel.</span>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────── */}
      {isLoading ? (
        <Card>
          <CardContent className="py-10 px-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Sparkles className="h-8 w-8 text-violet-500 animate-pulse" />
              <p className="font-medium">AI is tailoring your resume…</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Analyzing keywords, rewriting bullets, and calculating scores. This takes about 20–40 seconds (up to 60 s if enrichment is needed).
              </p>
              <div className="space-y-2 w-full max-w-sm mt-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-3 w-full" style={{ width: `${75 + Math.random() * 25}%` }} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : quotaError ? (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-10 w-10 mx-auto text-amber-500 mb-3" />
            <p className="font-medium text-base mb-1">OpenAI API Quota Exceeded</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              The OpenAI API key has run out of credits. Add billing at{" "}
              <a href="https://platform.openai.com/account/billing" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                platform.openai.com/account/billing
              </a>.
            </p>
            <Button variant="outline" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back to Job Detail
            </Button>
          </CardContent>
        </Card>
      ) : !activeResume?.plainText ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No resume with plain text found. Add one in Resume Vault to enable optimization.</p>
            <Button variant="outline" onClick={() => navigate("/resumes")}>Go to Resume Vault</Button>
          </CardContent>
        </Card>
      ) : optimizeResult?.tailoredResume ? (
        <div className="space-y-4">

          {/* Highlight legend */}
          <div className="flex items-center gap-5 text-xs text-muted-foreground px-1 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900/70" />
              Matched or added keywords
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-200 dark:bg-red-900/70" />
              Still missing keywords
            </div>
          </div>

          {/* 2-column workspace */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Left: Job Description */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Job Description
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-700 dark:text-green-400 font-medium">Green</span> = present in tailored resume ·{" "}
                  <span className="text-red-600 dark:text-red-400 font-medium">Red</span> = still missing
                </p>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-[580px] overflow-y-auto pr-1" data-testid="panel-job-description">
                  {renderHighlightedMultiline(plainJobDesc, jdGreenKws, jdRedKws)}
                </div>
              </CardContent>
            </Card>

            {/* Right: AI-Tailored Resume */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-violet-500" />
                      AI-Tailored Resume
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="text-green-700 dark:text-green-400 font-medium">Green</span> = keywords inserted or highlighted
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={copyTailoredResume} className="gap-1.5 text-xs h-7" data-testid="button-copy-tailored">
                    {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>

                {/* Still Missing */}
                {optimizeResult.stillMissingKeywords.length > 0 && (
                  <div className="mt-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" />
                      Still Missing ({optimizeResult.stillMissingKeywords.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {optimizeResult.stillMissingKeywords.map(k => (
                        <Badge key={k} className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800" data-testid={`badge-still-missing-${k}`}>
                          {k}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Added */}
                {optimizeResult.addedKeywords.length > 0 && (
                  <div className="mt-2 p-2.5 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1.5 flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Added ({optimizeResult.addedKeywords.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {optimizeResult.addedKeywords.map(k => (
                        <Badge key={k} className="text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" data-testid={`badge-added-${k}`}>
                          {k}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardHeader>

              <CardContent className="px-5 pb-5">
                <div
                  className="bg-muted/30 border rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-[580px] overflow-y-auto"
                  data-testid="text-tailored-resume"
                >
                  {renderHighlightedMultiline(optimizeResult.tailoredResume, resumeGreenKws, [])}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-1 pb-3">
            <Button variant="outline" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1.5" data-testid="button-bottom-back">
              <ArrowLeft className="h-4 w-4" />
              Back to Job Detail
            </Button>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyTailoredResume} data-testid="button-copy-tailored-bottom">
                <Copy className="h-4 w-4" />
                {copied ? "Copied!" : "Copy Resume"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-export-tailored">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { exportTxt(optimizeResult.tailoredResume!, `${job.title}_${job.company}`); toast({ title: "Exported TXT." }); }} data-testid="menu-export-tailored-txt">Export TXT</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { exportDoc(optimizeResult.tailoredResume!, `${job.title}_${job.company}`); toast({ title: "Exported DOC." }); }} data-testid="menu-export-tailored-doc">Export DOC</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { exportPdf(optimizeResult.tailoredResume!, `${job.title}_${job.company}`); toast({ title: "Exported PDF." }); }} data-testid="menu-export-tailored-pdf">Export PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => saveResumeMutation.mutate()}
                disabled={saveResumeMutation.isPending || saved}
                data-testid="button-save-tailored-resume"
              >
                {saved ? <><CheckCircle className="h-4 w-4" />Saved to Vault</> : saveResumeMutation.isPending ? <><Save className="h-4 w-4 animate-spin" />Saving…</> : <><Save className="h-4 w-4" />Save as New Resume</>}
              </Button>
            </div>
          </div>
        </div>
      ) : optimizeResult && !optimizeResult.tailoredResume ? (
        /* Fallback: rule-based (no AI) view */
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3 pt-5 px-5">
                <CardTitle className="text-sm flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Missing Keywords
                  <Badge variant="secondary" className="ml-auto text-xs">{optimizeResult.missingKeywords.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {optimizeResult.missingKeywords.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No missing keywords — great coverage!</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {optimizeResult.missingKeywords.map(k => (
                      <Badge key={k} className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800" data-testid={`badge-missing-${k}`}>{k}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3 pt-5 px-5">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Skills to Highlight
                  <Badge variant="secondary" className="ml-auto text-xs">{optimizeResult.skillsToHighlight.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="flex flex-wrap gap-1.5">
                  {optimizeResult.skillsToHighlight.map(s => (
                    <Badge key={s} className="text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" data-testid={`badge-highlight-${s}`}>{s}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          {optimizeResult.improvedSummary && (
            <Card>
              <CardHeader className="pb-3 pt-5 px-5">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  Improved Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-lg p-4 text-sm leading-relaxed">
                  {optimizeResult.improvedSummary}
                </div>
              </CardContent>
            </Card>
          )}
          {optimizeResult.improvedBullets && optimizeResult.improvedBullets.length > 0 && (
            <Card>
              <CardHeader className="pb-3 pt-5 px-5">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-violet-500" />
                  Improved Bullet Points
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-3">
                {optimizeResult.improvedBullets.map((b, i) => (
                  <div key={i} className="rounded-lg border overflow-hidden" data-testid={`card-bullet-${i}`}>
                    <div className="px-4 py-3 border-b bg-muted/50">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Original</p>
                      <p className="text-sm text-muted-foreground line-through">{b.original}</p>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-1">Improved</p>
                      <p className="text-sm font-medium">{b.improved}</p>
                      <p className="text-xs text-muted-foreground mt-1 italic">{b.reason}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <div className="flex items-center pt-2 pb-4">
            <Button variant="outline" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1.5" data-testid="button-bottom-back">
              <ArrowLeft className="h-4 w-4" />
              Back to Job Detail
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
