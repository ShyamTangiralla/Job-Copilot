function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_+/g, "_").substring(0, 60);
}

function buildFilename(resumeName: string, ext: string): string {
  const date = new Date().toISOString().split("T")[0];
  return `Resume_${sanitizeFilename(resumeName)}_${date}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportTxt(plainText: string, resumeName: string) {
  const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, buildFilename(resumeName, "txt"));
}

// ─── Server-side ATS export (proper DOCX / PDF) ───────────────────────────────

async function serverExport(
  endpoint: string,
  resumeText: string,
  resumeName: string,
  mimeType: string,
  ext: string
): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText, resumeName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Export failed" }));
    throw new Error(err.message ?? "Export failed");
  }

  const blob = await res.blob();
  const filename = buildFilename(resumeName, ext);
  triggerDownload(blob, filename);
}

export async function exportResumeDocx(resumeText: string, resumeName: string): Promise<void> {
  return serverExport(
    "/api/export-resume-docx",
    resumeText,
    resumeName,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx"
  );
}

export async function exportResumePdf(resumeText: string, resumeName: string): Promise<void> {
  return serverExport(
    "/api/export-resume-pdf",
    resumeText,
    resumeName,
    "application/pdf",
    "pdf"
  );
}

export interface ParsedResumeSections {
  name: string;
  contact: string;
  summary: string;
  skills: string;
  experience: string;
  projects: string;
  education: string;
  certifications: string;
}

export async function fetchResumeSections(resumeText: string): Promise<{ sections: ParsedResumeSections; hasCustomTemplate: boolean }> {
  const res = await fetch("/api/export-resume-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText }),
  });
  if (!res.ok) throw new Error("Failed to parse resume sections");
  return res.json();
}
