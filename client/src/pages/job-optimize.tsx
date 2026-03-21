import { useEffect, useState } from "react";
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
  ChevronRight,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Job, Resume } from "@shared/schema";

interface OptimizeResult {
  missingKeywords: string[];
  improvedSummary: string;
  improvedBullets: { original: string; improved: string; reason: string }[];
  skillsToHighlight: string[];
}

interface ATSBreakdown {
  atsScore: number;
  keywordOverlapPct: number;
  skillsOverlapPct: number;
  roleKeywordOverlapPct: number;
  matchedSkills: string[];
  missingSkills: string[];
  resumeName: string | null;
}

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

export default function JobOptimize() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const jobId = parseInt(id);

  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [hasRun, setHasRun] = useState(false);

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
    mutationFn: async ({ jobDescription, resumeText }: { jobDescription: string; resumeText: string }) => {
      const res = await apiRequest("POST", "/api/optimize-resume", { jobDescription, resumeText });
      return res.json() as Promise<OptimizeResult>;
    },
    onSuccess: (result) => {
      setOptimizeResult(result);
    },
    onError: () => {
      toast({ title: "Optimization failed", description: "Could not generate suggestions.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (job && activeResume?.plainText && !hasRun && !optimizeMutation.isPending) {
      setHasRun(true);
      const jobDescription = job.description ? stripHtml(job.description) : job.title;
      optimizeMutation.mutate({ jobDescription, resumeText: activeResume.plainText });
    }
  }, [job, activeResume, hasRun]);

  const copyAllSuggestions = () => {
    if (!optimizeResult) return;
    const lines: string[] = [];
    lines.push("=== RESUME OPTIMIZATION SUGGESTIONS ===");
    lines.push(`Job: ${job?.title} at ${job?.company}`);
    lines.push(`Resume: ${activeResume?.name ?? "Unknown"}`);
    lines.push("");
    if (optimizeResult.skillsToHighlight.length > 0) {
      lines.push("SKILLS TO HIGHLIGHT:");
      lines.push(optimizeResult.skillsToHighlight.join(", "));
      lines.push("");
    }
    if (optimizeResult.missingKeywords.length > 0) {
      lines.push("MISSING KEYWORDS TO ADD:");
      lines.push(optimizeResult.missingKeywords.join(", "));
      lines.push("");
    }
    lines.push("IMPROVED SUMMARY:");
    lines.push(optimizeResult.improvedSummary);
    lines.push("");
    if (optimizeResult.improvedBullets.length > 0) {
      lines.push("IMPROVED BULLET POINTS:");
      for (const b of optimizeResult.improvedBullets) {
        lines.push(`  Original: ${b.original}`);
        lines.push(`  Improved: ${b.improved}`);
        lines.push(`  Reason:   ${b.reason}`);
        lines.push("");
      }
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast({ title: "Copied to clipboard" });
    });
  };

  const isLoading = jobLoading || optimizeMutation.isPending;

  const atsScore = atsBreakdown?.atsScore ?? job?.atsScore ?? 0;
  const atsColor = atsScore >= 70
    ? "text-green-700 dark:text-green-400"
    : atsScore >= 40
    ? "text-yellow-600 dark:text-yellow-400"
    : "text-red-600 dark:text-red-400";
  const atsProgressColor = atsScore >= 70 ? "[&>div]:bg-green-500" : atsScore >= 40 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500";

  if (jobLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-96" />
        <div className="grid grid-cols-2 gap-4 mt-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/jobs/${jobId}`)}
          className="gap-1.5"
          data-testid="button-back-to-job"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Job Detail
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
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
        </div>
        <div className="flex gap-2 flex-wrap">
          {optimizeResult && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={copyAllSuggestions}
              data-testid="button-copy-all"
            >
              <Copy className="h-4 w-4" />
              Copy All Suggestions
            </Button>
          )}
          <Button
            variant="ghost"
            className="gap-1.5"
            onClick={() => navigate(`/jobs/${jobId}`)}
            data-testid="button-back-to-detail"
          >
            <ChevronRight className="h-4 w-4" />
            Full Job Detail
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">ATS Match Score</span>
                </div>
                {atsLoading ? (
                  <Skeleton className="h-5 w-16" />
                ) : (
                  <span className={`text-xl font-bold ${atsColor}`}>{atsScore}%</span>
                )}
              </div>
              <Progress value={atsScore} className={`h-2.5 ${atsProgressColor}`} />
            </div>

            <Separator orientation="vertical" className="hidden sm:block h-12" />

            <div className="flex flex-col sm:items-end gap-1 text-sm">
              <span className="text-muted-foreground">
                Resume: <span className="font-medium text-foreground">{atsBreakdown?.resumeName ?? activeResume?.name ?? "—"}</span>
              </span>
              {job.fitLabel && (
                <Badge variant="secondary" className="w-fit">{job.fitLabel}</Badge>
              )}
            </div>
          </div>

          {atsBreakdown && !atsLoading && (
            <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground text-xs">Keyword Overlap</span>
                  <span className="font-medium text-xs">{atsBreakdown.keywordOverlapPct}%</span>
                </div>
                <Progress value={atsBreakdown.keywordOverlapPct} className="h-1.5" />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground text-xs">Skills / Tools</span>
                  <span className="font-medium text-xs">{atsBreakdown.skillsOverlapPct}%</span>
                </div>
                <Progress value={atsBreakdown.skillsOverlapPct} className="h-1.5" />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground text-xs">Role Keywords</span>
                  <span className="font-medium text-xs">{atsBreakdown.roleKeywordOverlapPct}%</span>
                </div>
                <Progress value={atsBreakdown.roleKeywordOverlapPct} className="h-1.5" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      ) : !activeResume?.plainText ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No resume with plain text found.</p>
            <Button variant="outline" onClick={() => navigate("/resumes")}>Go to Resume Vault</Button>
          </CardContent>
        </Card>
      ) : optimizeResult ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3 pt-5 px-5">
                <CardTitle className="text-base flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Missing Keywords
                  <Badge variant="secondary" className="ml-auto text-xs">{optimizeResult.missingKeywords.length}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">These appear in the job description but not in your resume. Add them where relevant.</p>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {optimizeResult.missingKeywords.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No missing keywords — great coverage!</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {optimizeResult.missingKeywords.map(k => (
                      <Badge
                        key={k}
                        variant="secondary"
                        className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
                        data-testid={`badge-missing-${k}`}
                      >
                        {k}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 pt-5 px-5">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Skills to Highlight
                  <Badge variant="secondary" className="ml-auto text-xs">{optimizeResult.skillsToHighlight.length}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">You already have these — make sure they're prominent in your resume.</p>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {optimizeResult.skillsToHighlight.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No technical skill overlap detected.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {optimizeResult.skillsToHighlight.map(s => (
                      <Badge
                        key={s}
                        variant="secondary"
                        className="text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                        data-testid={`badge-highlight-${s}`}
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  Improved Summary
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => navigator.clipboard.writeText(optimizeResult.improvedSummary).then(() => toast({ title: "Summary copied" }))}
                  data-testid="button-copy-summary"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Suggested rewrite of your professional summary, tailored to this job. Suggestions only — your original is unchanged.</p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-lg p-4 text-sm leading-relaxed" data-testid="text-improved-summary">
                {optimizeResult.improvedSummary}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-violet-500" />
                Improved Bullet Points
                <Badge variant="secondary" className="ml-auto text-xs">{optimizeResult.improvedBullets.length} suggestions</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Suggested improvements to your experience bullets — stronger wording and better keyword integration. Suggestions only.</p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {optimizeResult.improvedBullets.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
                  <p className="text-sm text-muted-foreground">Your bullet points are already well-aligned with this job.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {optimizeResult.improvedBullets.map((b, i) => (
                    <div key={i} className="rounded-lg border bg-muted/30 overflow-hidden" data-testid={`card-bullet-${i}`}>
                      <div className="px-4 py-3 border-b bg-muted/50">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Original</p>
                        <p className="text-sm text-muted-foreground line-through leading-relaxed">{b.original}</p>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-1">Improved</p>
                        <p className="text-sm font-medium leading-relaxed">{b.improved}</p>
                        <p className="text-xs text-muted-foreground mt-2 italic">{b.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {optimizeResult.missingKeywords.length === 0 && optimizeResult.improvedBullets.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle className="h-10 w-10 mx-auto text-green-500 mb-3" />
                <p className="font-medium">Your resume is well-aligned with this job posting!</p>
                <p className="text-sm text-muted-foreground mt-1">No major gaps detected. Consider tailoring the summary to further strengthen the match.</p>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between pt-2 pb-4">
            <Button variant="outline" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1.5" data-testid="button-bottom-back">
              <ArrowLeft className="h-4 w-4" />
              Back to Job Detail
            </Button>
            <Button onClick={copyAllSuggestions} className="gap-1.5" data-testid="button-bottom-copy">
              <Copy className="h-4 w-4" />
              Copy All Suggestions
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
