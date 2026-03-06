import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  MapPin,
  Building,
  Calendar,
  Globe,
  User,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Job, CandidateProfile, Resume, ApplicationAnswer } from "@shared/schema";
import { JOB_STATUSES } from "@shared/schema";
import { useState, useEffect } from "react";

export default function JobDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");

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
    if (job) setNotes(job.notes);
  }, [job]);

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/jobs/${params.id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Status updated" });
    },
  });

  const updateNotes = useMutation({
    mutationFn: async (notesVal: string) => {
      const res = await apiRequest("PATCH", `/api/jobs/${params.id}`, { notes: notesVal });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", params.id] });
    },
  });

  const recommendedResume = resumes?.find(
    (r) => r.roleType === job?.roleClassification && r.active
  );

  const statusColors: Record<string, string> = {
    New: "secondary",
    Reviewed: "default",
    "Ready to Apply": "default",
    Applied: "default",
    Skipped: "secondary",
    Interview: "default",
    Rejected: "destructive",
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
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
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate("/jobs")} data-testid="button-back">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Jobs
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
        {job.resumeRecommendation && (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            Recommended: {job.resumeRecommendation}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground mr-1">Status:</span>
        {JOB_STATUSES.map((s) => (
          <Button
            key={s}
            variant={job.status === s ? "default" : "secondary"}
            size="sm"
            onClick={() => updateStatus.mutate(s)}
            disabled={updateStatus.isPending}
            data-testid={`button-status-${s.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {s}
          </Button>
        ))}
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
                  if (notes !== job.notes) updateNotes.mutate(notes);
                }}
                rows={3}
                placeholder="Add notes about this application..."
                data-testid="input-job-notes"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
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

          {profile && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  Your Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {profile.fullName && <p className="font-medium">{profile.fullName}</p>}
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
