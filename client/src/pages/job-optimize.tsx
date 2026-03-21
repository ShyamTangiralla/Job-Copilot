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
  Download,
  Save,
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

interface OptimizeResult {
  tailoredResume?: string;
  missingKeywords: string[];
  skillsToHighlight: string[];
  improvedSummary?: string;
  improvedBullets?: { original: string; improved: string; reason: string }[];
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
    mutationFn: async ({ jobDescription, resumeText }: { jobDescription: string; resumeText: string }) => {
      const res = await apiRequest("POST", "/api/optimize-resume", { jobDescription, resumeText });
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
      toast({ title: "Save failed", description: "Could not save resume. Please try again.", variant: "destructive" });
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

  const copyKeywordSummary = () => {
    if (!optimizeResult) return;
    const lines: string[] = [];
    lines.push(`Resume Optimization — ${job?.title} at ${job?.company}`);
    lines.push("");
    if (optimizeResult.skillsToHighlight.length > 0) {
      lines.push("SKILLS TO HIGHLIGHT:");
      lines.push(optimizeResult.skillsToHighlight.join(", "));
      lines.push("");
    }
    if (optimizeResult.missingKeywords.length > 0) {
      lines.push("MISSING KEYWORDS:");
      lines.push(optimizeResult.missingKeywords.join(", "));
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast({ title: "Keyword summary copied" });
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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
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
          <p className="text-xs text-muted-foreground mt-1">
            Resume: <span className="font-medium text-foreground">{atsBreakdown?.resumeName ?? activeResume?.name ?? "—"}</span>
            <span className="mx-2 text-muted-foreground/50">·</span>
            <span className="italic">Suggestions only — your original resume is never changed</span>
          </p>
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

            {atsBreakdown && !atsLoading && (
              <>
                <Separator orientation="vertical" className="hidden sm:block h-12" />
                <div className="grid grid-cols-3 gap-3 text-sm flex-1">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-muted-foreground text-xs">Keywords</span>
                      <span className="font-medium text-xs">{atsBreakdown.keywordOverlapPct}%</span>
                    </div>
                    <Progress value={atsBreakdown.keywordOverlapPct} className="h-1.5" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-muted-foreground text-xs">Skills</span>
                      <span className="font-medium text-xs">{atsBreakdown.skillsOverlapPct}%</span>
                    </div>
                    <Progress value={atsBreakdown.skillsOverlapPct} className="h-1.5" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-muted-foreground text-xs">Role KW</span>
                      <span className="font-medium text-xs">{atsBreakdown.roleKeywordOverlapPct}%</span>
                    </div>
                    <Progress value={atsBreakdown.roleKeywordOverlapPct} className="h-1.5" />
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="py-8 px-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="relative">
                  <Sparkles className="h-8 w-8 text-violet-500 animate-pulse" />
                </div>
                <p className="font-medium">AI is tailoring your resume…</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Analyzing the job description, identifying missing keywords, and rewriting your resume to be more competitive. This takes about 15–30 seconds.
                </p>
                <div className="space-y-2 w-full max-w-sm mt-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : quotaError ? (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-10 w-10 mx-auto text-amber-500 mb-3" />
            <p className="font-medium text-base mb-1">OpenAI API Quota Exceeded</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              The OpenAI API key has run out of credits. To use AI resume optimization, add billing or switch to a key with an active plan at{" "}
              <a href="https://platform.openai.com/account/billing" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">platform.openai.com/account/billing</a>.
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
            <p className="text-sm text-muted-foreground mb-3">No resume with plain text found. Add one in the Resume Vault to enable optimization.</p>
            <Button variant="outline" onClick={() => navigate("/resumes")}>Go to Resume Vault</Button>
          </CardContent>
        </Card>
      ) : optimizeResult ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3 pt-5 px-5">
                <CardTitle className="text-sm flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Missing Keywords
                  <Badge variant="secondary" className="ml-auto text-xs">{optimizeResult.missingKeywords.length}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">In the job description but not in your resume.</p>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {optimizeResult.missingKeywords.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No missing keywords — great coverage!</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {optimizeResult.missingKeywords.map(k => (
                      <Badge key={k} variant="secondary"
                        className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
                        data-testid={`badge-missing-${k}`}>
                        {k}
                      </Badge>
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
                <p className="text-xs text-muted-foreground">You already have these — make them prominent.</p>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {optimizeResult.skillsToHighlight.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No overlapping skills detected.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {optimizeResult.skillsToHighlight.map(s => (
                      <Badge key={s} variant="secondary"
                        className="text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                        data-testid={`badge-highlight-${s}`}>
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {optimizeResult.tailoredResume ? (
            <Card>
              <CardHeader className="pb-3 pt-5 px-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-violet-500" />
                      AI-Tailored Resume
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Rewritten for this specific job — suggestions only. Your original is unchanged.
                    </p>
                  </div>
                  <Button
                    onClick={copyTailoredResume}
                    className="gap-2"
                    data-testid="button-copy-tailored"
                  >
                    {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied!" : "Copy Resume"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div
                  className="bg-muted/40 border rounded-lg p-5 font-mono text-sm leading-relaxed whitespace-pre-wrap max-h-[600px] overflow-y-auto"
                  data-testid="text-tailored-resume"
                >
                  {optimizeResult.tailoredResume}
                </div>
                <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-muted-foreground italic">
                    Review carefully before use. AI may make small errors — verify all details are accurate.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={copyTailoredResume} data-testid="button-copy-tailored-bottom">
                      <Copy className="h-3.5 w-3.5" />
                      Copy to Clipboard
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs" data-testid="button-export-tailored">
                          <Download className="h-3.5 w-3.5" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => { exportTxt(optimizeResult.tailoredResume!, `${job!.title}_${job!.company}`); toast({ title: "Resume exported successfully." }); }}
                          data-testid="menu-export-tailored-txt"
                        >
                          Export TXT
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => { exportDoc(optimizeResult.tailoredResume!, `${job!.title}_${job!.company}`); toast({ title: "Resume exported successfully." }); }}
                          data-testid="menu-export-tailored-doc"
                        >
                          Export DOC
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => { exportPdf(optimizeResult.tailoredResume!, `${job!.title}_${job!.company}`); toast({ title: "Resume exported successfully." }); }}
                          data-testid="menu-export-tailored-pdf"
                        >
                          Export PDF
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => saveResumeMutation.mutate()}
                      disabled={saveResumeMutation.isPending || saved}
                      data-testid="button-save-tailored-resume"
                    >
                      {saved ? (
                        <><CheckCircle className="h-3.5 w-3.5" />Saved to Vault</>
                      ) : saveResumeMutation.isPending ? (
                        <><Save className="h-3.5 w-3.5 animate-spin" />Saving…</>
                      ) : (
                        <><Save className="h-3.5 w-3.5" />Save as New Resume</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : optimizeResult.improvedSummary ? (
            <div className="space-y-4">
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
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-2 pb-4">
            <Button variant="outline" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1.5" data-testid="button-bottom-back">
              <ArrowLeft className="h-4 w-4" />
              Back to Job Detail
            </Button>
            {optimizeResult.tailoredResume && (
              <Button onClick={copyTailoredResume} className="gap-1.5" data-testid="button-bottom-copy">
                <Copy className="h-4 w-4" />
                {copied ? "Copied!" : "Copy Tailored Resume"}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
