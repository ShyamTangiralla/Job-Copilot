import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Search,
  CheckCircle,
  XCircle,
  Copy,
  Save,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Trash2,
  History,
  Pencil,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Job, CandidateProfile, Resume, ApplicationAnswer } from "@shared/schema";
import { JOB_STATUSES, PRIORITIES } from "@shared/schema";
import { useState, useEffect, useMemo } from "react";

interface KeywordAnalysis {
  jobKeywords: string[];
  resumeKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  weakKeywords: string[];
}

interface Improvement {
  section: string;
  oldLine: string;
  newLine: string;
  reason: string;
}

interface TailoringResult {
  keywordAnalysis: KeywordAnalysis;
  improvements: Improvement[];
  tailoredText: string;
  matchBefore: number;
  matchAfter: number;
  improvementSummary: string;
  resumeName: string;
  jobTitle: string;
  jobCompany: string;
}

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

function ResumeTailoringAssistant({ job, resumes }: { job: Job; resumes: Resume[] }) {
  const { toast } = useToast();
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [result, setResult] = useState<TailoringResult | null>(null);
  const [activeTab, setActiveTab] = useState<"keywords" | "improvements" | "draft" | "summary">("keywords");
  const [showKeywordsExpanded, setShowKeywordsExpanded] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState("");

  const activeResumes = resumes.filter(r => r.active && r.plainText && r.plainText.trim().length > 0);

  useEffect(() => {
    if (activeResumes.length > 0 && !selectedResumeId) {
      const recommended = activeResumes.find(
        r => r.roleType === (job.resumeRecommendation || job.roleClassification)
      );
      if (recommended) {
        setSelectedResumeId(String(recommended.id));
      } else {
        setSelectedResumeId(String(activeResumes[0].id));
      }
    }
  }, [activeResumes, job, selectedResumeId]);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tailoring/analyze", {
        jobId: job.id,
        resumeId: parseInt(selectedResumeId),
      });
      return res.json();
    },
    onSuccess: (data: TailoringResult) => {
      setResult(data);
      setActiveTab("keywords");
      setIsEditing(false);
      setEditedDraft("");
      toast({ title: "Analysis Complete", description: data.improvementSummary });
    },
    onError: (err: any) => {
      toast({ title: "Analysis Failed", description: err.message, variant: "destructive" });
    },
  });

  const currentDraft = isEditing || editedDraft ? editedDraft : result?.tailoredText || "";

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No analysis result");
      const textToSave = editedDraft || result.tailoredText;
      const res = await apiRequest("POST", "/api/tailoring/save", {
        jobId: job.id,
        resumeId: parseInt(selectedResumeId),
        originalText: activeResumes.find(r => r.id === parseInt(selectedResumeId))?.plainText || "",
        tailoredText: textToSave,
        keywordAnalysis: result.keywordAnalysis,
        improvements: result.improvements,
        matchBefore: result.matchBefore,
        matchAfter: result.matchAfter,
        improvementSummary: result.improvementSummary,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Tailored resume saved to this job's history." });
      queryClient.invalidateQueries({ queryKey: ["/api/tailoring/history", String(job.id)] });
    },
    onError: (err: any) => {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    },
  });

  const saveAsResumeMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("No result");
      const selectedResume = activeResumes.find(r => r.id === parseInt(selectedResumeId));
      const textToSave = editedDraft || result.tailoredText;
      const res = await apiRequest("POST", "/api/tailoring/save-as-resume", {
        tailoredText: textToSave,
        name: saveName || `${selectedResume?.name || "Resume"} - Tailored for ${job.company}`,
        roleType: selectedResume?.roleType || job.roleClassification || "Data Analyst",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Resume Created", description: "Tailored version saved to Resume Vault." });
      setSaveName("");
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
    },
    onError: (err: any) => {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    },
  });

  const copyToClipboard = () => {
    const text = editedDraft || result?.tailoredText;
    if (text) {
      navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Tailored resume copied to clipboard." });
    }
  };

  if (activeResumes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            Resume Tailoring Assistant
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No active resumes with text content found. Add a resume with plain text in the Resume Vault to use the tailoring assistant.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" />
          Resume Tailoring Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Select Master Resume</Label>
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
          className="w-full"
          onClick={() => analyzeMutation.mutate()}
          disabled={!selectedResumeId || analyzeMutation.isPending}
          data-testid="button-analyze-resume"
        >
          {analyzeMutation.isPending ? (
            <>
              <Search className="h-4 w-4 mr-1 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-1" />
              Analyze Resume Match
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-3 mt-2">
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <div className="flex-1 text-center">
                <p className="text-xs text-muted-foreground">Before</p>
                <p className="text-lg font-semibold" data-testid="text-match-before">{result.matchBefore}%</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 text-center">
                <p className="text-xs text-muted-foreground">After</p>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400" data-testid="text-match-after">{result.matchAfter}%</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground" data-testid="text-improvement-summary">{result.improvementSummary}</p>

            <div className="flex gap-1">
              {(["keywords", "improvements", "draft", "summary"] as const).map(tab => (
                <Button
                  key={tab}
                  variant={activeTab === tab ? "default" : "ghost"}
                  size="sm"
                  className="text-xs px-2 py-1 h-7"
                  onClick={() => setActiveTab(tab)}
                  data-testid={`button-tab-${tab}`}
                >
                  {tab === "keywords" ? "Keywords" : tab === "improvements" ? "Changes" : tab === "draft" ? "Draft" : "Summary"}
                </Button>
              ))}
            </div>

            {activeTab === "keywords" && (
              <div className="space-y-2 text-sm">
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-xs font-medium">Matched ({result.keywordAnalysis.matchedKeywords.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.keywordAnalysis.matchedKeywords.slice(0, showKeywordsExpanded ? undefined : 12).map(kw => (
                      <Badge key={kw} variant="secondary" className="text-xs bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">{kw}</Badge>
                    ))}
                    {!showKeywordsExpanded && result.keywordAnalysis.matchedKeywords.length > 12 && (
                      <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={() => setShowKeywordsExpanded(true)}>
                        +{result.keywordAnalysis.matchedKeywords.length - 12} more
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    <span className="text-xs font-medium">Missing ({result.keywordAnalysis.missingKeywords.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.keywordAnalysis.missingKeywords.slice(0, showKeywordsExpanded ? undefined : 12).map(kw => (
                      <Badge key={kw} variant="secondary" className="text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">{kw}</Badge>
                    ))}
                    {!showKeywordsExpanded && result.keywordAnalysis.missingKeywords.length > 12 && (
                      <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={() => setShowKeywordsExpanded(true)}>
                        +{result.keywordAnalysis.missingKeywords.length - 12} more
                      </Button>
                    )}
                  </div>
                </div>
                {result.keywordAnalysis.weakKeywords.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      <span className="text-xs font-medium">Weak Phrasing</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {result.keywordAnalysis.weakKeywords.map(kw => (
                        <Badge key={kw} variant="secondary" className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">{kw}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(result.keywordAnalysis.matchedKeywords.length > 12 || result.keywordAnalysis.missingKeywords.length > 12) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6"
                    onClick={() => setShowKeywordsExpanded(!showKeywordsExpanded)}
                  >
                    {showKeywordsExpanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    {showKeywordsExpanded ? "Show less" : "Show all"}
                  </Button>
                )}
              </div>
            )}

            {activeTab === "improvements" && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {result.improvements.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No changes needed — resume is already well-aligned.</p>
                ) : (
                  result.improvements.map((imp, i) => (
                    <div key={i} className="border rounded p-2 space-y-1">
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs">{imp.section}</Badge>
                        <span className="text-xs text-muted-foreground">{imp.reason}</span>
                      </div>
                      <div className="text-xs">
                        <div className="bg-red-50 dark:bg-red-900/10 rounded px-2 py-1 line-through text-red-600 dark:text-red-400 break-words" data-testid={`text-old-line-${i}`}>
                          {imp.oldLine}
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/10 rounded px-2 py-1 mt-0.5 text-green-700 dark:text-green-400 break-words" data-testid={`text-new-line-${i}`}>
                          {imp.newLine}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "draft" && (
              <div className="space-y-2">
                <div className="flex gap-1 flex-wrap">
                  {!isEditing ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        setEditedDraft(editedDraft || result.tailoredText);
                        setIsEditing(true);
                      }}
                      data-testid="button-edit-draft"
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit Draft
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setIsEditing(false)}
                      data-testid="button-save-edited-draft"
                    >
                      <Save className="h-3 w-3 mr-1" />
                      Done Editing
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" className="text-xs h-7" onClick={copyToClipboard} data-testid="button-copy-draft">
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Final
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-tailored"
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save to Job
                  </Button>
                </div>
                {isEditing ? (
                  <textarea
                    value={editedDraft}
                    onChange={e => setEditedDraft(e.target.value)}
                    className="w-full border rounded p-2 text-xs font-mono leading-relaxed min-h-[320px] max-h-[500px] resize-y bg-background"
                    data-testid="textarea-edit-draft"
                  />
                ) : (
                  <div className="border rounded p-2 max-h-80 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed" data-testid="text-tailored-draft">
                      {editedDraft || result.tailoredText}
                    </pre>
                  </div>
                )}
                {editedDraft && editedDraft !== result.tailoredText && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Draft has been manually edited</p>
                )}
                <div className="space-y-1.5 pt-1 border-t">
                  <Label className="text-xs text-muted-foreground">Save as new resume in Vault</Label>
                  <div className="flex gap-1">
                    <Input
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      placeholder={`Resume - Tailored for ${job.company}`}
                      className="text-xs h-8"
                      data-testid="input-save-resume-name"
                    />
                    <Button
                      size="sm"
                      className="text-xs h-8 shrink-0"
                      onClick={() => saveAsResumeMutation.mutate()}
                      disabled={saveAsResumeMutation.isPending}
                      data-testid="button-save-as-resume"
                    >
                      Save to Vault
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "summary" && (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="border rounded p-2 text-center">
                    <p className="text-xs text-muted-foreground">ATS Match Before</p>
                    <p className="text-xl font-semibold">{result.matchBefore}%</p>
                  </div>
                  <div className="border rounded p-2 text-center">
                    <p className="text-xs text-muted-foreground">ATS Match After</p>
                    <p className="text-xl font-semibold text-green-600 dark:text-green-400">{result.matchAfter}%</p>
                  </div>
                </div>
                <div className="border rounded p-2">
                  <p className="text-xs font-medium mb-1">Changes Made</p>
                  <ul className="text-xs space-y-0.5 text-muted-foreground">
                    <li>Keywords integrated: {result.improvements.filter(i => i.reason.includes("keyword")).length}</li>
                    <li>Wording strengthened: {result.improvements.filter(i => i.reason.includes("Strengthened")).length}</li>
                    <li>Total modifications: {result.improvements.length}</li>
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">{result.improvementSummary}</p>
              </div>
            )}
          </div>
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

  useEffect(() => {
    if (job) {
      setNotes(job.notes);
      setFollowUpDate(job.followUpDate ?? "");
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
        {job.applyLink && (
          <Button
            onClick={() => window.open(job.applyLink, "_blank")}
            data-testid="button-open-apply-link"
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Open Apply Link
          </Button>
        )}
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

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground mr-1">Status:</span>
        {JOB_STATUSES.map((s) => (
          <Button
            key={s}
            variant={job.status === s ? "default" : "secondary"}
            size="sm"
            onClick={() => updateStatus(s)}
            disabled={updateJob.isPending}
            data-testid={`button-status-${s.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {s}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
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
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Follow-up:</span>
          <Input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            onBlur={() => {
              if (followUpDate !== (job.followUpDate ?? "")) {
                updateJob.mutate({ followUpDate });
              }
            }}
            className="w-[160px]"
            data-testid="input-followup-date"
          />
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
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  if (notes !== job.notes) updateJob.mutate({ notes });
                }}
                rows={3}
                placeholder="Add notes about this application..."
                data-testid="input-job-notes"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
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
    </div>
  );
}
