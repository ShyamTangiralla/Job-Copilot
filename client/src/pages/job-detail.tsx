import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  MapPin,
  Building,
  Calendar,
  User,
  AlertTriangle,
  Clock,
  Flag,
  Target,
  Sparkles,
  Copy,
  ArrowRight,
  Trash2,
  History,
  BarChart3,
  CheckCircle2,
  XCircle,
  Minus,
  FileDown,
  Mail,
  RefreshCw,
  Loader2,
  Trophy,
  DollarSign,
} from "lucide-react";
import { exportResumePdf } from "@/lib/export-resume";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Job, CandidateProfile, Resume, ApplicationAnswer, ResumeVersion, JobNote } from "@shared/schema";
import { APPLICATION_STATUSES, PRIORITIES } from "@shared/schema";
import { useState, useEffect, useMemo } from "react";
import {
  Dialog as ApplyDialog,
  DialogContent as ApplyDialogContent,
  DialogHeader as ApplyDialogHeader,
  DialogTitle as ApplyDialogTitle,
  DialogDescription as ApplyDialogDescription,
  DialogFooter as ApplyDialogFooter,
} from "@/components/ui/dialog";

interface TailoredResumeRecord {
  id: number;
  jobId: number;
  resumeId: number;
  tailoredText: string;
  matchBefore: number;
  matchAfter: number;
  improvementSummary: string;
  createdAt: string;
}

function TailoringHistory({ jobId }: { jobId: number }) {
  const { toast } = useToast();
  const { data: history, isLoading } = useQuery<TailoredResumeRecord[]>({
    queryKey: ["/api/tailoring/history", String(jobId)],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/tailoring/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/tailoring/history", String(jobId)] });
    },
  });

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  if (isLoading || !history || history.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-1.5">
          <History className="h-4 w-4" />
          Tailoring History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {history.map(h => (
          <div key={h.id} className="border rounded p-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {new Date(h.createdAt).toLocaleDateString()}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyText(h.tailoredText)}
                  data-testid={`button-copy-history-${h.id}`}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive"
                  onClick={() => deleteMutation.mutate(h.id)}
                  data-testid={`button-delete-history-${h.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span>{h.matchBefore}%</span>
              <ArrowRight className="h-3 w-3" />
              <span className="text-green-600 dark:text-green-400 font-medium">{h.matchAfter}%</span>
            </div>
            <p className="text-xs text-muted-foreground">{h.improvementSummary}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Job Match Analysis ───────────────────────────────────────────────────────

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

function scoreColor(s: number) {
  if (s >= 75) return "text-green-700 dark:text-green-400";
  if (s >= 50) return "text-amber-600 dark:text-amber-500";
  return "text-red-600 dark:text-red-400";
}
function scoreBg(s: number) {
  if (s >= 75) return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
  if (s >= 50) return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
  return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
}
function barCls(s: number) {
  if (s >= 70) return "[&>div]:bg-green-500";
  if (s >= 40) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
}

function JobMatchAnalysis({ jobId, onOptimize }: { jobId: number; onOptimize: () => void }) {
  const { data: breakdown, isLoading } = useQuery<ATSBreakdown>({
    queryKey: ["/api/jobs", String(jobId), "ats-breakdown"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />Job Match Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!breakdown || (breakdown.atsScore === 0 && breakdown.matchedSkills.length === 0)) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />Job Match Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add an active resume to see how well it matches this job.
          </p>
        </CardContent>
      </Card>
    );
  }

  const score = breakdown.atsScore;

  const recommendation =
    score >= 75
      ? { text: "Strong fit — ready to apply", icon: <CheckCircle2 className="h-4 w-4 shrink-0" />, showOptimize: false }
      : score >= 50
      ? { text: "Good potential — optimize your resume first", icon: <Minus className="h-4 w-4 shrink-0" />, showOptimize: true }
      : { text: "Lower fit — significant tailoring needed", icon: <XCircle className="h-4 w-4 shrink-0" />, showOptimize: true };

  const strengths = [
    ...breakdown.matchedSkills,
    ...breakdown.matchedRoleKeywords.filter(k => !breakdown.matchedSkills.includes(k)),
  ].slice(0, 14);

  const gaps = [
    ...breakdown.missingSkills,
    ...breakdown.missingRoleKeywords.filter(k => !breakdown.missingSkills.includes(k)),
  ].slice(0, 12);

  const categories = [
    { label: "Technical Skills", value: breakdown.technicalSkillsPct },
    { label: "Role Keywords", value: breakdown.roleKeywordsPct },
    { label: "Domain Keywords", value: breakdown.domainKeywordsPct },
    { label: "Phrase Alignment", value: breakdown.keywordAlignmentPct },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4" />Job Match Analysis
        </CardTitle>
        {breakdown.resumeName && (
          <p className="text-xs text-muted-foreground">
            vs. <span className="font-medium">{breakdown.resumeName}</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Score + recommendation */}
        <div className={`flex items-center gap-3 rounded-lg border p-3 ${scoreBg(score)}`}>
          <span className={`text-3xl font-bold leading-none ${scoreColor(score)}`} data-testid="text-match-score">
            {score}%
          </span>
          <div className="flex-1 min-w-0">
            <Progress value={score} className={`h-2 mb-1.5 ${barCls(score)}`} />
            <div className={`flex items-center gap-1.5 text-sm font-medium ${scoreColor(score)}`}>
              {recommendation.icon}
              <span data-testid="text-match-recommendation">{recommendation.text}</span>
            </div>
          </div>
        </div>

        {recommendation.showOptimize && (
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5 text-xs"
            onClick={onOptimize}
            data-testid="button-optimize-from-match"
          >
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            Optimize Resume for This Job
          </Button>
        )}

        {/* Category breakdown */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Breakdown</p>
          {categories.map(({ label, value }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-[110px] shrink-0">{label}</span>
              <Progress value={value} className={`h-1.5 flex-1 ${barCls(value)}`} />
              <span className={`text-xs font-medium w-8 text-right ${scoreColor(value)}`}>{value}%</span>
            </div>
          ))}
        </div>

        {/* Strengths */}
        {strengths.length > 0 && (
          <div className="space-y-1.5" data-testid="section-strengths">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
              Strengths ({strengths.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {strengths.map(k => (
                <Badge
                  key={k}
                  variant="secondary"
                  className="text-xs bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800"
                  data-testid={`badge-strength-${k}`}
                >
                  {k}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Gaps */}
        {gaps.length > 0 && (
          <div className="space-y-1.5" data-testid="section-gaps">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500 dark:text-red-400" />
              Gaps ({gaps.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {gaps.map(k => (
                <Badge
                  key={k}
                  variant="secondary"
                  className="text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                  data-testid={`badge-gap-${k}`}
                >
                  {k}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Cover Letter Generator ───────────────────────────────────────────────────

interface SavedCoverLetter {
  id: number;
  jobId: number;
  resumeId: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function CoverLetterGenerator({ job, resumes }: { job: Job; resumes: Resume[] }) {
  const { toast } = useToast();
  const activeResumes = resumes.filter(r => r.active && r.plainText && r.plainText.trim().length > 0);
  const [selectedResumeId, setSelectedResumeId] = useState<string>(
    activeResumes[0]?.id ? String(activeResumes[0].id) : ""
  );
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: saved } = useQuery<SavedCoverLetter | null>({
    queryKey: ["/api/jobs", String(job.id), "cover-letter"],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${job.id}/cover-letter`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  useEffect(() => {
    if (saved?.content && !content) {
      setContent(saved.content);
      if (saved.resumeId) setSelectedResumeId(String(saved.resumeId));
    }
  }, [saved]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const resume = activeResumes.find(r => String(r.id) === selectedResumeId);
      if (!resume) throw new Error("Please select a resume first");
      const res = await apiRequest("POST", `/api/jobs/${job.id}/cover-letter/generate`, {
        resumeText: resume.plainText,
        resumeId: resume.id,
      });
      const data = await res.json() as { content: string; cached?: boolean; code?: string; message?: string };
      if (!res.ok) {
        const err: any = new Error(data.message ?? "Generation failed");
        err.code = data.code;
        throw err;
      }
      return data;
    },
    onSuccess: async (data) => {
      setContent(data.content);
      if (!data.cached) {
        await saveMutation.mutateAsync(data.content);
      }
      toast({ title: data.cached ? "Cover letter loaded from cache" : "Cover letter generated" });
    },
    onError: (e: any) => {
      if (e.code === "LIMIT_EXCEEDED") {
        toast({ title: "AI limit reached", description: "Cover letter has been generated 2 times for this job.", variant: "destructive" });
      } else {
        toast({ title: "Generation failed", description: e.message, variant: "destructive" });
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      const resumeId = parseInt(selectedResumeId) || 0;
      await apiRequest("POST", `/api/jobs/${job.id}/cover-letter`, { content: text, resumeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", String(job.id), "cover-letter"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/jobs/${job.id}/cover-letter`);
    },
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", String(job.id), "cover-letter"] });
      toast({ title: "Cover letter cleared" });
    },
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPdf = async () => {
    try {
      await exportResumePdf(content, `CoverLetter_${job.company}_${job.title}`);
      toast({ title: "PDF downloaded successfully." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  const handleBlur = () => {
    if (content.trim() && content !== saved?.content) {
      saveMutation.mutate(content);
    }
  };

  if (activeResumes.length === 0) return null;

  return (
    <Card data-testid="card-cover-letter">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-1.5">
          <Mail className="h-4 w-4" />
          Cover Letter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Resume selector */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Resume</Label>
          <Select
            value={selectedResumeId}
            onValueChange={setSelectedResumeId}
            data-testid="select-cover-letter-resume"
          >
            <SelectTrigger className="h-8 text-xs" data-testid="trigger-cover-letter-resume">
              <SelectValue placeholder="Select resume..." />
            </SelectTrigger>
            <SelectContent>
              {activeResumes.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Generate button */}
        <Button
          className="w-full gap-1.5 text-xs h-8"
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending || !selectedResumeId}
          data-testid="button-generate-cover-letter"
        >
          {generateMutation.isPending ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              {content ? "Regenerate Cover Letter" : "Generate Cover Letter"}
            </>
          )}
        </Button>

        {/* Generated content */}
        {content && (
          <>
            <Separator />
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              onBlur={handleBlur}
              className="text-xs leading-relaxed resize-none"
              rows={14}
              data-testid="textarea-cover-letter"
            />
            {saveMutation.isPending && (
              <p className="text-xs text-muted-foreground">Saving...</p>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 text-xs h-7"
                onClick={handleCopy}
                data-testid="button-copy-cover-letter"
              >
                <Copy className="h-3 w-3" />
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 text-xs h-7"
                onClick={handleExportPdf}
                data-testid="button-export-cover-letter-pdf"
              >
                <FileDown className="h-3 w-3" />
                Export PDF
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => deleteMutation.mutate()}
                title="Clear cover letter"
                data-testid="button-delete-cover-letter"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ResumeTailoringAssistant({ job, resumes }: { job: Job; resumes: Resume[] }) {
  const [, navigate] = useLocation();
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");

  const activeResumes = resumes.filter(r => r.active && r.plainText && r.plainText.trim().length > 0);

  useEffect(() => {
    if (activeResumes.length > 0 && !selectedResumeId) {
      const recommended = activeResumes.find(
        r => r.roleType === (job.resumeRecommendation || job.roleClassification)
      );
      setSelectedResumeId(String(recommended ? recommended.id : activeResumes[0].id));
    }
  }, [activeResumes, job, selectedResumeId]);

  if (activeResumes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            Resume Optimization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No active resumes with text content found. Add a resume with plain text in the Resume Vault to enable optimization.
          </p>
          <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs" onClick={() => navigate("/resumes")}>
            <FileText className="h-3.5 w-3.5" />
            Go to Resume Vault
          </Button>
        </CardContent>
      </Card>
    );
  }

  const selectedResume = activeResumes.find(r => r.id === parseInt(selectedResumeId));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" />
          Resume Optimization
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Resume to use</Label>
          <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
            <SelectTrigger data-testid="select-tailoring-resume">
              <SelectValue placeholder="Choose a resume" />
            </SelectTrigger>
            <SelectContent>
              {activeResumes.map(r => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.roleType})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full gap-2"
          onClick={() => navigate(`/jobs/${job.id}/optimize`)}
          disabled={!selectedResumeId}
          data-testid="button-analyze-resume"
        >
          <Sparkles className="h-4 w-4" />
          Optimize Resume
        </Button>

        {selectedResume && (
          <p className="text-xs text-muted-foreground text-center">
            Opens full optimization view for <span className="font-medium">{selectedResume.name}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function JobDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [dateApplied, setDateApplied] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [recruiterName, setRecruiterName] = useState("");
  const [recruiterEmail, setRecruiterEmail] = useState("");
  const [offerSalary, setOfferSalary] = useState("");
  const [offerDate, setOfferDate] = useState("");
  const [offerDeadline, setOfferDeadline] = useState("");
  const [offerDecision, setOfferDecision] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");

  // Structured note texts by type
  const [noteTexts, setNoteTexts] = useState<Record<string, string>>({
    general: "", interview: "", questions: "",
  });

  // Apply dialog state
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("none");

  const { data: job, isLoading } = useQuery<Job>({
    queryKey: ["/api/jobs", params.id],
  });

  const { data: profile } = useQuery<CandidateProfile>({
    queryKey: ["/api/profile"],
  });

  const { data: resumes } = useQuery<Resume[]>({
    queryKey: ["/api/resumes"],
  });

  const { data: answers } = useQuery<ApplicationAnswer[]>({
    queryKey: ["/api/answers"],
  });

  const jobId = parseInt(params.id);
  const { data: jobVersions = [] } = useQuery<ResumeVersion[]>({
    queryKey: ["/api/resume-versions", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/resume-versions?jobId=${jobId}`);
      return res.json();
    },
    enabled: !!params.id,
  });

  const { data: jobNotes = [] } = useQuery<JobNote[]>({
    queryKey: ["/api/jobs", params.id, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${params.id}/notes`);
      return res.json();
    },
    enabled: !!params.id,
  });

  // Sync noteTexts when notes are loaded
  useEffect(() => {
    if (jobNotes.length > 0) {
      const updated: Record<string, string> = { general: "", interview: "", questions: "" };
      for (const note of jobNotes) {
        const key = note.noteType ?? "general";
        if (key in updated) updated[key] = note.content ?? "";
      }
      setNoteTexts(updated);
    }
  }, [jobNotes]);

  const saveNoteMutation = useMutation({
    mutationFn: async ({ noteType, content }: { noteType: string; content: string }) => {
      const existing = jobNotes.find(n => n.noteType === noteType);
      if (existing) {
        return apiRequest("PATCH", `/api/jobs/${params.id}/notes/${existing.id}`, { content });
      } else {
        return apiRequest("POST", `/api/jobs/${params.id}/notes`, { noteType, content });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", params.id, "notes"] });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const versionId = selectedVersionId !== "none" ? parseInt(selectedVersionId) : null;
      const version = versionId ? jobVersions.find(v => v.id === versionId) : null;
      const payload: Record<string, any> = {
        status: "Applied",
        dateApplied: today,
        resumeVersionId: versionId ?? undefined,
        atsScoreAtApply: version?.atsScoreAfter ?? undefined,
        resumeGeneratedDate: version ? new Date(version.createdAt).toISOString().split("T")[0] : "",
      };
      const res = await apiRequest("PATCH", `/api/jobs/${params.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      setApplyDialogOpen(false);
      toast({ title: "Marked as Applied!", description: selectedVersionId !== "none" ? "Resume version recorded." : "No version linked." });
    },
    onError: (e: any) => toast({ title: "Failed to apply", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (job) {
      setNotes(job.notes);
      setFollowUpDate(job.followUpDate ?? "");
      setDateApplied((job as any).dateApplied ?? "");
      setInterviewDate((job as any).interviewDate ?? "");
      setRecruiterName((job as any).recruiterName ?? "");
      setRecruiterEmail((job as any).recruiterEmail ?? "");
      setOfferSalary((job as any).offerSalary ?? "");
      setOfferDate((job as any).offerDate ?? "");
      setOfferDeadline((job as any).offerDeadline ?? "");
      setOfferDecision((job as any).offerDecision ?? "");
      setOfferNotes((job as any).offerNotes ?? "");
      setSalaryMin((job as any).salaryMin?.toString() ?? "");
      setSalaryMax((job as any).salaryMax?.toString() ?? "");
    }
  }, [job]);

  const updateJob = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/jobs/${params.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
  });

  const updateStatus = (status: string) => {
    updateJob.mutate({ status });
    toast({ title: `Status updated to ${status}` });
  };

  const updatePriority = (priority: string) => {
    updateJob.mutate({ priority });
    toast({ title: `Priority set to ${priority}` });
  };

  const recommendedResume = resumes?.find(
    (r) => r.roleType === (job?.resumeRecommendation || job?.roleClassification) && r.active
  );

  const missingInfo = useMemo(() => {
    if (!profile || !job) return [];
    const warnings: string[] = [];
    const desc = (job.description ?? "").toLowerCase();

    if (!profile.fullName) warnings.push("Full name is not set in your profile");
    if (!profile.email) warnings.push("Email is not set in your profile");
    if (!profile.phone) warnings.push("Phone number is not set in your profile");

    if (desc.includes("linkedin") && !profile.linkedinUrl) {
      warnings.push("Job mentions LinkedIn but your LinkedIn URL is not saved");
    }
    if (desc.includes("portfolio") && !profile.portfolioUrl) {
      warnings.push("Job mentions portfolio but your Portfolio URL is not saved");
    }
    if ((desc.includes("authorization") || desc.includes("work authorization") || desc.includes("visa")) && !profile.workAuthorization) {
      warnings.push("Job mentions work authorization but yours is not set");
    }
    if ((desc.includes("salary") || desc.includes("compensation")) && !profile.salaryPreference) {
      warnings.push("Job mentions salary/compensation but your preference is not saved");
    }
    if ((desc.includes("relocat") || desc.includes("relocation")) && !profile.willingToRelocate && !profile.preferredLocations) {
      warnings.push("Job mentions relocation but your relocation preference is not set");
    }

    const recType = job.resumeRecommendation || job.roleClassification;
    if (!recommendedResume && recType && recType !== "Unknown") {
      warnings.push(`No active resume found for role type "${recType}"`);
    }

    return warnings;
  }, [profile, job, recommendedResume]);

  const priorityColor: Record<string, string> = {
    High: "text-red-600 dark:text-red-400",
    Medium: "text-amber-600 dark:text-amber-400",
    Low: "text-muted-foreground",
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Job not found.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/jobs")} data-testid="button-back">
          Back to Jobs
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate("/jobs")} data-testid="button-back">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Jobs Inbox
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-job-title">{job.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Building className="h-3.5 w-3.5" />
              {job.company}
            </span>
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {job.location}
              </span>
            )}
            {job.datePosted && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {job.datePosted}
              </span>
            )}
            <Badge variant="secondary" className="text-xs">{job.workMode}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {job.applyLink && (
            <Button
              variant={job.status === "Applied" ? "outline" : "default"}
              onClick={() => window.open(job.applyLink, "_blank")}
              data-testid="button-open-apply-link"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open Apply Link
            </Button>
          )}
          {job.status !== "Applied" ? (
            <Button
              variant="default"
              onClick={() => setApplyDialogOpen(true)}
              data-testid="button-mark-applied"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Mark as Applied
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-emerald-600 text-white" data-testid="badge-applied-status">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Applied
              </Badge>
              {job.resumeVersionId && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <History className="h-3 w-3" />
                  Version used: <strong>{jobVersions.find(v => v.id === job.resumeVersionId)?.versionLabel ?? `#${job.resumeVersionId}`}</strong>
                  {job.atsScoreAtApply ? <span className="ml-1 text-emerald-600 font-medium">({job.atsScoreAtApply}% ATS)</span> : null}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {job.roleClassification && job.roleClassification !== "Unknown" && (
          <Badge variant="secondary">{job.roleClassification}</Badge>
        )}
        {job.fitLabel && (
          <Badge variant={job.fitLabel === "Strong Match" ? "default" : "secondary"}>
            {job.fitLabel}
          </Badge>
        )}
        {job.applyPriorityLabel && (
          <Badge
            variant={job.applyPriorityLabel === "Apply Immediately" ? "default" : "secondary"}
            data-testid="badge-apply-priority-label"
          >
            {job.applyPriorityLabel}
          </Badge>
        )}
        {job.resumeRecommendation && (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            Recommended: {recommendedResume ? recommendedResume.name : job.resumeRecommendation}
          </span>
        )}
      </div>

      {missingInfo.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm font-medium">Missing Information</AlertTitle>
          <AlertDescription>
            <ul className="text-sm list-disc pl-4 mt-1 space-y-0.5">
              {missingInfo.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          <Select value={job.status} onValueChange={(v) => { updateStatus(v); }} data-testid="select-job-status">
            <SelectTrigger className="w-[160px]" data-testid="trigger-job-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPLICATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s} data-testid={`option-status-${s.toLowerCase().replace(/\s+/g, "-")}`}>{s}</SelectItem>
              ))}
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Reviewed">Reviewed</SelectItem>
              <SelectItem value="Ready to Apply">Ready to Apply</SelectItem>
              <SelectItem value="Skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Flag className={`h-4 w-4 ${priorityColor[job.priority] ?? ""}`} />
          <span className="text-sm text-muted-foreground">Priority:</span>
          <Select value={job.priority} onValueChange={updatePriority}>
            <SelectTrigger className="w-[120px]" data-testid="select-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Job Description</CardTitle>
            </CardHeader>
            <CardContent>
              {job.description ? (
                <div className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-job-description">
                  {job.description}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No description provided.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Quick note (legacy job.notes) */}
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  if (notes !== job.notes) updateJob.mutate({ notes });
                }}
                rows={2}
                placeholder="Quick note about this job..."
                data-testid="input-job-notes"
                className="text-xs"
              />

              {/* Structured notes by type */}
              <Tabs defaultValue="general" className="mt-1">
                <TabsList className="h-7 text-xs">
                  <TabsTrigger value="general" className="text-xs px-3 h-6">General</TabsTrigger>
                  <TabsTrigger value="interview" className="text-xs px-3 h-6">Interview</TabsTrigger>
                  <TabsTrigger value="questions" className="text-xs px-3 h-6">Questions Asked</TabsTrigger>
                </TabsList>
                {["general", "interview", "questions"].map(type => (
                  <TabsContent key={type} value={type}>
                    <Textarea
                      value={noteTexts[type] ?? ""}
                      onChange={e => setNoteTexts(prev => ({ ...prev, [type]: e.target.value }))}
                      onBlur={() => {
                        const content = noteTexts[type] ?? "";
                        const existing = jobNotes.find(n => n.noteType === type);
                        const existingContent = existing?.content ?? "";
                        if (content !== existingContent) {
                          saveNoteMutation.mutate({ noteType: type, content });
                        }
                      }}
                      rows={4}
                      placeholder={
                        type === "general" ? "General notes about this role…" :
                        type === "interview" ? "Interviewers, topics, feedback…" :
                        "Questions they asked, or questions you plan to ask…"
                      }
                      className="text-xs mt-2"
                      data-testid={`textarea-note-${type}`}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Application Tracking Card */}
          <Card data-testid="card-application-tracking">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-1.5">
                <Target className="h-4 w-4" />
                Application Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date Applied</Label>
                  <Input
                    type="date"
                    value={dateApplied}
                    onChange={(e) => setDateApplied(e.target.value)}
                    onBlur={() => {
                      if (dateApplied !== ((job as any).dateApplied ?? "")) {
                        updateJob.mutate({ dateApplied });
                      }
                    }}
                    className="h-8 text-xs"
                    data-testid="input-date-applied"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Interview Date</Label>
                  <Input
                    type="date"
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    onBlur={() => {
                      if (interviewDate !== ((job as any).interviewDate ?? "")) {
                        updateJob.mutate({ interviewDate });
                      }
                    }}
                    className="h-8 text-xs"
                    data-testid="input-interview-date"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Follow-up Date</Label>
                  <Input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    onBlur={() => {
                      if (followUpDate !== (job.followUpDate ?? "")) {
                        updateJob.mutate({ followUpDate });
                      }
                    }}
                    className="h-8 text-xs"
                    data-testid="input-followup-date"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Recruiter Name</Label>
                <Input
                  value={recruiterName}
                  onChange={(e) => setRecruiterName(e.target.value)}
                  onBlur={() => {
                    if (recruiterName !== ((job as any).recruiterName ?? "")) {
                      updateJob.mutate({ recruiterName });
                    }
                  }}
                  placeholder="e.g. Jane Smith"
                  className="h-8 text-xs"
                  data-testid="input-recruiter-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Recruiter Email</Label>
                <Input
                  type="email"
                  value={recruiterEmail}
                  onChange={(e) => setRecruiterEmail(e.target.value)}
                  onBlur={() => {
                    if (recruiterEmail !== ((job as any).recruiterEmail ?? "")) {
                      updateJob.mutate({ recruiterEmail });
                    }
                  }}
                  placeholder="e.g. jane@company.com"
                  className="h-8 text-xs"
                  data-testid="input-recruiter-email"
                />
              </div>

              {/* Salary Range */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Salary Range
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    value={salaryMin}
                    onChange={e => setSalaryMin(e.target.value)}
                    onBlur={() => {
                      const val = salaryMin ? parseInt(salaryMin) : null;
                      if (val !== ((job as any).salaryMin ?? null)) {
                        updateJob.mutate({ salaryMin: val });
                      }
                    }}
                    placeholder="Min e.g. 80000"
                    className="h-8 text-xs"
                    data-testid="input-salary-min"
                  />
                  <Input
                    type="number"
                    value={salaryMax}
                    onChange={e => setSalaryMax(e.target.value)}
                    onBlur={() => {
                      const val = salaryMax ? parseInt(salaryMax) : null;
                      if (val !== ((job as any).salaryMax ?? null)) {
                        updateJob.mutate({ salaryMax: val });
                      }
                    }}
                    placeholder="Max e.g. 110000"
                    className="h-8 text-xs"
                    data-testid="input-salary-max"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Offer Details — shown only when status is Offer */}
          {job.status === "Offer" && (
            <Card data-testid="card-offer-details">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-indigo-500" />
                  Offer Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Offered Salary</Label>
                    <Input
                      value={offerSalary}
                      onChange={e => setOfferSalary(e.target.value)}
                      onBlur={() => {
                        if (offerSalary !== ((job as any).offerSalary ?? "")) {
                          updateJob.mutate({ offerSalary });
                        }
                      }}
                      placeholder="e.g. 95000"
                      className="h-8 text-xs"
                      data-testid="input-offer-salary"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Decision</Label>
                    <Select
                      value={offerDecision || "Pending"}
                      onValueChange={v => {
                        setOfferDecision(v);
                        updateJob.mutate({ offerDecision: v });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-offer-decision">
                        <SelectValue placeholder="Select decision" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Pending", "Accepted", "Rejected", "Negotiating", "Withdrawn"].map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Offer Date</Label>
                    <Input
                      type="date"
                      value={offerDate}
                      onChange={e => setOfferDate(e.target.value)}
                      onBlur={() => {
                        if (offerDate !== ((job as any).offerDate ?? "")) {
                          updateJob.mutate({ offerDate });
                        }
                      }}
                      className="h-8 text-xs"
                      data-testid="input-offer-date"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Decision Deadline</Label>
                    <Input
                      type="date"
                      value={offerDeadline}
                      onChange={e => setOfferDeadline(e.target.value)}
                      onBlur={() => {
                        if (offerDeadline !== ((job as any).offerDeadline ?? "")) {
                          updateJob.mutate({ offerDeadline });
                        }
                      }}
                      className="h-8 text-xs"
                      data-testid="input-offer-deadline"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Offer Notes</Label>
                  <Textarea
                    value={offerNotes}
                    onChange={e => setOfferNotes(e.target.value)}
                    onBlur={() => {
                      if (offerNotes !== ((job as any).offerNotes ?? "")) {
                        updateJob.mutate({ offerNotes });
                      }
                    }}
                    placeholder="Benefits, equity, signing bonus, negotiation details..."
                    rows={3}
                    className="text-xs"
                    data-testid="textarea-offer-notes"
                  />
                </div>
                <div className="pt-1">
                  <a href="/offers" className="text-xs text-primary hover:underline flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    View all offers in Offer Tracker
                  </a>
                </div>
              </CardContent>
            </Card>
          )}

          <JobMatchAnalysis
            jobId={job.id}
            onOptimize={() => navigate(`/jobs/${job.id}/optimize`)}
          />

          {resumes && resumes.length > 0 && (
            <CoverLetterGenerator job={job} resumes={resumes} />
          )}

          {resumes && (
            <ResumeTailoringAssistant job={job} resumes={resumes} />
          )}

          <TailoringHistory jobId={job.id} />

          {(job.applyPriorityScore > 0 || job.applyPriorityLabel) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-1.5">
                  <Target className="h-4 w-4" />
                  Apply Priority Score
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-2xl font-semibold"
                    data-testid="text-apply-priority-score"
                  >
                    {job.applyPriorityScore}
                  </span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
                <Progress
                  value={job.applyPriorityScore}
                  className="h-2"
                  data-testid="progress-apply-priority"
                />
                {job.applyPriorityLabel && (
                  <Badge
                    variant={job.applyPriorityLabel === "Apply Immediately" ? "default" : "secondary"}
                    data-testid="badge-apply-priority-card"
                  >
                    {job.applyPriorityLabel}
                  </Badge>
                )}
                {job.applyPriorityExplanation && (
                  <p
                    className="text-sm text-muted-foreground leading-relaxed"
                    data-testid="text-apply-priority-explanation"
                  >
                    {job.applyPriorityExplanation}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {recommendedResume && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Recommended Resume
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium" data-testid="text-recommended-resume">{recommendedResume.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{recommendedResume.roleType}</p>
              </CardContent>
            </Card>
          )}

          {profile && profile.fullName && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  Your Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-medium">{profile.fullName}</p>
                {profile.email && <p className="text-muted-foreground">{profile.email}</p>}
                {profile.phone && <p className="text-muted-foreground">{profile.phone}</p>}
                {profile.location && <p className="text-muted-foreground">{profile.location}</p>}
                {profile.workAuthorization && (
                  <p className="text-muted-foreground">Auth: {profile.workAuthorization}</p>
                )}
                {profile.salaryPreference && (
                  <p className="text-muted-foreground">Salary: {profile.salaryPreference}</p>
                )}
              </CardContent>
            </Card>
          )}

          {answers && answers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">Standard Answers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {answers.map((a) => (
                  <div key={a.id}>
                    <p className="text-xs font-medium text-muted-foreground">{a.question}</p>
                    <p className="text-sm mt-0.5">{a.answer}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ─── Apply Dialog ──────────────────────────────────────────────────────── */}
      <ApplyDialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <ApplyDialogContent className="max-w-md">
          <ApplyDialogHeader>
            <ApplyDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Mark as Applied
            </ApplyDialogTitle>
            <ApplyDialogDescription>
              Recording your application to <strong>{job?.title}</strong> at <strong>{job?.company}</strong>.
              Optionally link the resume version you used.
            </ApplyDialogDescription>
          </ApplyDialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Resume Version Used</Label>
              {jobVersions.length === 0 ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                  No saved versions for this job yet.{" "}
                  <a href={`/jobs/${params.id}/optimize`} className="text-primary underline">
                    Run optimization
                  </a>{" "}
                  to create one.
                </div>
              ) : (
                <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
                  <SelectTrigger data-testid="select-apply-version">
                    <SelectValue placeholder="Select a resume version (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None — don't link a version</SelectItem>
                    {jobVersions.map(v => (
                      <SelectItem key={v.id} value={String(v.id)} data-testid={`option-version-${v.id}`}>
                        {v.versionLabel} · ATS {v.atsScoreAfter}% · {new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedVersionId !== "none" && (() => {
              const v = jobVersions.find(ver => ver.id === parseInt(selectedVersionId));
              if (!v) return null;
              return (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">ATS Score (before → after)</span>
                    <span className="font-medium">{v.atsScoreBefore}% → <span className="text-emerald-600">{v.atsScoreAfter}%</span></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Generated</span>
                    <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                  {v.candidateName && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Candidate</span>
                      <span>{v.candidateName}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <p className="text-xs text-muted-foreground">
              This will set the status to <strong>Applied</strong> and record today's date as the application date.
            </p>
          </div>

          <ApplyDialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)} data-testid="button-apply-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-apply-confirm"
            >
              {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirm Applied
            </Button>
          </ApplyDialogFooter>
        </ApplyDialogContent>
      </ApplyDialog>
    </div>
  );
}
