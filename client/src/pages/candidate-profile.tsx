import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { User, Plus, Pencil, Trash2, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CandidateProfile as CandidateProfileType, ApplicationAnswer } from "@shared/schema";
import { useState, useEffect } from "react";

export default function CandidateProfilePage() {
  const { toast } = useToast();
  const [answerDialogOpen, setAnswerDialogOpen] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState<ApplicationAnswer | null>(null);

  const { data: profile, isLoading: profileLoading } = useQuery<CandidateProfileType>({
    queryKey: ["/api/profile"],
  });

  const { data: answers, isLoading: answersLoading } = useQuery<ApplicationAnswer[]>({
    queryKey: ["/api/answers"],
  });

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedinUrl: "",
    portfolioUrl: "",
    workAuthorization: "",
    sponsorshipRequired: false,
    salaryPreference: "",
    willingToRelocate: false,
    preferredLocations: "",
    preferredJobTypes: [] as string[],
    yearsOfExperience: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        linkedinUrl: profile.linkedinUrl,
        portfolioUrl: profile.portfolioUrl,
        workAuthorization: profile.workAuthorization,
        sponsorshipRequired: profile.sponsorshipRequired,
        salaryPreference: profile.salaryPreference,
        willingToRelocate: profile.willingToRelocate,
        preferredLocations: profile.preferredLocations,
        preferredJobTypes: profile.preferredJobTypes ?? [],
        yearsOfExperience: profile.yearsOfExperience,
      });
    }
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/profile", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Profile saved" });
    },
  });

  const saveAnswer = useMutation({
    mutationFn: async (data: { question: string; answer: string }) => {
      if (editingAnswer) {
        const res = await apiRequest("PATCH", `/api/answers/${editingAnswer.id}`, data);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/answers", data);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/answers"] });
      setAnswerDialogOpen(false);
      setEditingAnswer(null);
      toast({ title: "Answer saved" });
    },
  });

  const deleteAnswer = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/answers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/answers"] });
      toast({ title: "Answer deleted" });
    },
  });

  const toggleJobType = (type: string) => {
    setForm((prev) => ({
      ...prev,
      preferredJobTypes: prev.preferredJobTypes.includes(type)
        ? prev.preferredJobTypes.filter((t) => t !== type)
        : [...prev.preferredJobTypes, type],
    }));
  };

  const handleAnswerSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    saveAnswer.mutate({
      question: fd.get("question") as string,
      answer: fd.get("answer") as string,
    });
  };

  if (profileLoading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Candidate Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your personal information and standard application answers.
          </p>
        </div>
        <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending} data-testid="button-save-profile">
          <Save className="h-4 w-4 mr-1" />
          {saveProfile.isPending ? "Saving..." : "Save Profile"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-1.5">
            <User className="h-4 w-4" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} data-testid="input-full-name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-email" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-phone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="location">Location</Label>
              <Input id="location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} data-testid="input-location" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
              <Input id="linkedinUrl" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} data-testid="input-linkedin" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="portfolioUrl">Portfolio URL</Label>
              <Input id="portfolioUrl" value={form.portfolioUrl} onChange={(e) => setForm({ ...form, portfolioUrl: e.target.value })} data-testid="input-portfolio" />
            </div>
          </div>

          <Separator />

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="workAuth">Work Authorization</Label>
              <Input id="workAuth" value={form.workAuthorization} onChange={(e) => setForm({ ...form, workAuthorization: e.target.value })} placeholder="e.g. US Citizen, H1-B..." data-testid="input-work-auth" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="salary">Salary Preference</Label>
              <Input id="salary" value={form.salaryPreference} onChange={(e) => setForm({ ...form, salaryPreference: e.target.value })} placeholder="e.g. $80,000 - $100,000" data-testid="input-salary" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="yoe">Years of Experience</Label>
              <Input id="yoe" value={form.yearsOfExperience} onChange={(e) => setForm({ ...form, yearsOfExperience: e.target.value })} placeholder="e.g. 5" data-testid="input-yoe" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prefLocations">Preferred Locations</Label>
              <Input id="prefLocations" value={form.preferredLocations} onChange={(e) => setForm({ ...form, preferredLocations: e.target.value })} placeholder="e.g. New York, Chicago..." data-testid="input-pref-locations" />
            </div>
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch checked={form.sponsorshipRequired} onCheckedChange={(v) => setForm({ ...form, sponsorshipRequired: v })} data-testid="switch-sponsorship" />
              <Label>Sponsorship Required</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.willingToRelocate} onCheckedChange={(v) => setForm({ ...form, willingToRelocate: v })} data-testid="switch-relocate" />
              <Label>Willing to Relocate</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preferred Job Types</Label>
            <div className="flex items-center gap-4 flex-wrap">
              {["Remote", "Hybrid", "Onsite"].map((type) => (
                <div key={type} className="flex items-center gap-2">
                  <Checkbox
                    checked={form.preferredJobTypes.includes(type)}
                    onCheckedChange={() => toggleJobType(type)}
                    data-testid={`checkbox-jobtype-${type.toLowerCase()}`}
                  />
                  <Label className="text-sm">{type}</Label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base font-medium">Standard Application Answers</CardTitle>
            <Dialog open={answerDialogOpen} onOpenChange={(open) => { setAnswerDialogOpen(open); if (!open) setEditingAnswer(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary" onClick={() => { setEditingAnswer(null); setAnswerDialogOpen(true); }} data-testid="button-add-answer">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Answer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingAnswer ? "Edit Answer" : "Add Standard Answer"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAnswerSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="question">Question</Label>
                    <Input id="question" name="question" required defaultValue={editingAnswer?.question ?? ""} placeholder="e.g. Why do you want to work here?" data-testid="input-answer-question" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="answer">Answer</Label>
                    <Textarea id="answer" name="answer" required defaultValue={editingAnswer?.answer ?? ""} rows={4} data-testid="input-answer-text" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => setAnswerDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={saveAnswer.isPending} data-testid="button-submit-answer">
                      {saveAnswer.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {answersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !answers || answers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No standard answers yet. Add common Q&A pairs for quick reference.
            </p>
          ) : (
            <div className="space-y-3">
              {answers.map((a) => (
                <div key={a.id} className="rounded-md bg-muted/40 p-3" data-testid={`card-answer-${a.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.question}</p>
                      <p className="text-sm text-muted-foreground mt-1">{a.answer}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingAnswer(a); setAnswerDialogOpen(true); }} data-testid={`button-edit-answer-${a.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteAnswer.mutate(a.id)} data-testid={`button-delete-answer-${a.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
