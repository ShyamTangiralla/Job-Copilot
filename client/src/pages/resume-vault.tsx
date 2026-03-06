import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, FileText, Pencil, Trash2, Clock, Upload, Eye, Download, File, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Resume } from "@shared/schema";
import { ROLE_TYPES } from "@shared/schema";

export default function ResumeVault() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingResume, setEditingResume] = useState<Resume | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data: resumes, isLoading } = useQuery<Resume[]>({
    queryKey: ["/api/resumes"],
  });

  const createResume = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/resumes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      setDialogOpen(false);
      setEditingResume(null);
      toast({ title: "Resume saved" });
    },
  });

  const updateResume = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/resumes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      setDialogOpen(false);
      setEditingResume(null);
      toast({ title: "Resume updated" });
    },
  });

  const deleteResume = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/resumes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({ title: "Resume deleted" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/resumes/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
    },
  });

  const uploadFile = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      setUploadingId(id);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/resumes/${id}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({ title: "File uploaded" });
      setUploadingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setUploadingId(null);
    },
  });

  const removeFile = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/resumes/${id}/file`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove file");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({ title: "File removed" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get("name") as string,
      roleType: fd.get("roleType") as string,
      plainText: fd.get("plainText") as string,
      active: true,
    };
    if (editingResume) {
      updateResume.mutate({ id: editingResume.id, ...data });
    } else {
      createResume.mutate(data);
    }
  };

  const handleFileSelect = (resumeId: number, file: File) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only PDF and DOCX files are allowed.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10 MB.", variant: "destructive" });
      return;
    }
    uploadFile.mutate({ id: resumeId, file });
  };

  const openEdit = (resume: Resume) => {
    setEditingResume(resume);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingResume(null);
    setDialogOpen(true);
  };

  const getFileExtBadge = (fileType: string) => {
    if (fileType.includes("pdf")) return "PDF";
    if (fileType.includes("wordprocessingml")) return "DOCX";
    return "File";
  };

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Resume Vault</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your master resumes for different role types. Upload files and maintain plain text for matching.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingResume(null); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew} data-testid="button-add-resume">
              <Plus className="h-4 w-4 mr-1" />
              Add Resume
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingResume ? "Edit Resume" : "Add Resume"}</DialogTitle>
              <DialogDescription>
                {editingResume ? "Update resume details and plain text content." : "Create a new resume entry. You can upload a file after saving."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name">Resume Name *</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  defaultValue={editingResume?.name ?? ""}
                  data-testid="input-resume-name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="roleType">Role Type *</Label>
                <select
                  name="roleType"
                  id="roleType"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={editingResume?.roleType ?? ROLE_TYPES[0]}
                  data-testid="select-resume-role"
                >
                  {ROLE_TYPES.filter((r) => r !== "Unknown").map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="plainText">Plain Text Resume Content</Label>
                <Textarea
                  id="plainText"
                  name="plainText"
                  rows={10}
                  defaultValue={editingResume?.plainText ?? ""}
                  placeholder="Paste your resume content here for AI matching and preview..."
                  data-testid="input-resume-text"
                />
                <p className="text-xs text-muted-foreground">Used for role matching and text preview. Keep this updated alongside your file.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)} data-testid="button-cancel-resume">
                  Cancel
                </Button>
                <Button type="submit" disabled={createResume.isPending || updateResume.isPending} data-testid="button-submit-resume">
                  {editingResume ? "Update" : "Add"} Resume
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-6 w-40 mb-3" />
                <Skeleton className="h-4 w-28 mb-2" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !resumes || resumes.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No resumes yet. Add your first master resume.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {resumes.map((resume) => (
            <Card key={resume.id} data-testid={`card-resume-${resume.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-medium truncate" data-testid={`text-resume-name-${resume.id}`}>{resume.name}</h3>
                    <Badge variant="secondary" className="text-xs mt-1">{resume.roleType}</Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={resume.active}
                      onCheckedChange={(checked) => toggleActive.mutate({ id: resume.id, active: checked })}
                      data-testid={`switch-resume-active-${resume.id}`}
                    />
                  </div>
                </div>

                {resume.fileName ? (
                  <div className="border rounded-md p-3 mb-3 bg-muted/30" data-testid={`file-info-${resume.id}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <File className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate" data-testid={`text-filename-${resume.id}`}>{resume.fileName}</span>
                      <Badge variant="outline" className="text-xs shrink-0">{getFileExtBadge(resume.fileType)}</Badge>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/api/resumes/${resume.id}/file`, "_blank")}
                        data-testid={`button-view-resume-${resume.id}`}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/api/resumes/${resume.id}/download`, "_blank")}
                        data-testid={`button-download-resume-${resume.id}`}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRefs.current[resume.id]?.click()}
                        disabled={uploadingId === resume.id}
                        data-testid={`button-replace-file-${resume.id}`}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        Replace
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile.mutate(resume.id)}
                        data-testid={`button-remove-file-${resume.id}`}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Remove
                      </Button>
                    </div>
                    <input
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      ref={(el) => { fileInputRefs.current[resume.id] = el; }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(resume.id, file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                ) : (
                  <div className="border border-dashed rounded-md p-3 mb-3 text-center" data-testid={`upload-area-${resume.id}`}>
                    <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground mb-2">No file attached</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRefs.current[resume.id]?.click()}
                      disabled={uploadingId === resume.id}
                      data-testid={`button-upload-file-${resume.id}`}
                    >
                      {uploadingId === resume.id ? "Uploading..." : "Upload PDF or DOCX"}
                    </Button>
                    <input
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      ref={(el) => { fileInputRefs.current[resume.id] = el; }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(resume.id, file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                )}

                {resume.plainText && (
                  <p className="text-xs text-muted-foreground line-clamp-3 mb-3">
                    {resume.plainText.substring(0, 200)}...
                  </p>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(resume.updatedAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(resume)} data-testid={`button-edit-resume-${resume.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteResume.mutate(resume.id)} data-testid={`button-delete-resume-${resume.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {!resume.active && (
                  <Badge variant="secondary" className="text-xs mt-2">Inactive</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
