import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertJobSchema, insertResumeSchema, insertApplicationAnswerSchema, insertCandidateProfileSchema, insertResumeVersionSchema, insertJobNoteSchema, insertContactSchema } from "@shared/schema";
import { scrapeJobFromUrl, parseEmailContent, parseBulkInput } from "./scraper";
import { runDiscovery, stopDiscovery, isDiscoveryRunning } from "./discovery";
import { analyzeAndTailor, optimizeResume } from "./tailoring";
import { aiOptimizeResume, generateSuggestions, extractKeywords, generateCoverLetter } from "./ai-optimize";
import { searchLinkedInJobs } from "./linkedin-search";
import { calculateATSBreakdown, calculateATSScore } from "./ats";
import {
  parseResumeForExport,
  generateResumeDocx,
  generateResumePdf,
  fillDocxTemplate,
  hasCustomTemplate,
  getCustomTemplate,
  saveCustomTemplate,
} from "./docx-export";

/**
 * Strip HTML tags and decode common entities for server-side text processing.
 * Used whenever stored HTML job descriptions are passed to the scorer or AI.
 */
function serverStripHtml(html: string): string {
  return html
    .replace(/<\/?(li|p|br|div|h[1-6]|tr|td|th|ul|ol|section|article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const uploadsDir = path.join(process.cwd(), "uploads", "resumes");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const resumeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `resume-${uniqueSuffix}${ext}`);
  },
});

const uploadResume = multer({
  storage: resumeStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and DOCX files are allowed"));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/profile", async (_req, res) => {
    try {
      const profile = await storage.getProfile();
      res.json(profile ?? {
        id: 0, fullName: "", email: "", phone: "", location: "",
        linkedinUrl: "", portfolioUrl: "", workAuthorization: "",
        sponsorshipRequired: false, salaryPreference: "", willingToRelocate: false,
        preferredLocations: "", preferredJobTypes: [], yearsOfExperience: "",
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/profile", async (req, res) => {
    try {
      const parsed = insertCandidateProfileSchema.parse(req.body);
      const profile = await storage.upsertProfile(parsed);
      res.json(profile);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/resumes", async (_req, res) => {
    try {
      const list = await storage.getResumes();
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/resumes", async (req, res) => {
    try {
      const parsed = insertResumeSchema.parse(req.body);
      const resume = await storage.createResume(parsed);
      res.json(resume);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/resumes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const resume = await storage.updateResume(id, req.body);
      if (!resume) return res.status(404).json({ message: "Resume not found" });
      res.json(resume);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/resumes/:id/upload", (req, res, next) => {
    uploadResume.single("file")(req, res, (err) => {
      if (err) {
        const message = err instanceof multer.MulterError
          ? (err.code === "LIMIT_FILE_SIZE" ? "File too large. Maximum size is 10 MB." : err.message)
          : err.message || "File upload failed";
        return res.status(400).json({ message });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid resume ID" });
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      const resume = await storage.getResume(id);
      if (!resume) {
        fs.unlinkSync(file.path);
        return res.status(404).json({ message: "Resume not found" });
      }
      if (resume.filePath) {
        const oldPath = path.join(uploadsDir, path.basename(resume.filePath));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      const updated = await storage.updateResume(id, {
        fileName: file.originalname,
        filePath: file.filename,
        fileType: file.mimetype,
      });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/resumes/:id/file", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid resume ID" });
      const resume = await storage.getResume(id);
      if (!resume || !resume.filePath) return res.status(404).json({ message: "No file found" });
      const filePath = path.join(uploadsDir, path.basename(resume.filePath));
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File missing from disk" });
      res.setHeader("Content-Type", resume.fileType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${resume.fileName}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/resumes/:id/download", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid resume ID" });
      const resume = await storage.getResume(id);
      if (!resume || !resume.filePath) return res.status(404).json({ message: "No file found" });
      const filePath = path.join(uploadsDir, path.basename(resume.filePath));
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File missing from disk" });
      res.setHeader("Content-Type", resume.fileType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${resume.fileName}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── ATS Resume Export (DOCX) ───────────────────────────────────────────────
  app.post("/api/export-resume-docx", async (req, res) => {
    try {
      const { resumeText, resumeName } = req.body;
      if (!resumeText) return res.status(400).json({ message: "resumeText is required" });
      const sections = parseResumeForExport(resumeText);
      let buffer: Buffer;
      if (hasCustomTemplate()) {
        const templateBuffer = getCustomTemplate();
        buffer = fillDocxTemplate(templateBuffer, sections);
      } else {
        buffer = await generateResumeDocx(sections, resumeName);
      }
      const safe = (resumeName || "Resume").replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 60);
      const date = new Date().toISOString().split("T")[0];
      const filename = `Resume_${safe}_${date}.docx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── ATS Resume Export (PDF) ─────────────────────────────────────────────────
  app.post("/api/export-resume-pdf", async (req, res) => {
    try {
      const { resumeText, resumeName } = req.body;
      if (!resumeText) return res.status(400).json({ message: "resumeText is required" });
      const sections = parseResumeForExport(resumeText);
      const buffer = await generateResumePdf(sections, resumeName);
      const safe = (resumeName || "Resume").replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 60);
      const date = new Date().toISOString().split("T")[0];
      const filename = `Resume_${safe}_${date}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Parse resume into sections (for preview) ─────────────────────────────────
  app.post("/api/export-resume-preview", async (req, res) => {
    try {
      const { resumeText } = req.body;
      if (!resumeText) return res.status(400).json({ message: "resumeText is required" });
      const sections = parseResumeForExport(resumeText);
      res.json({ sections, hasCustomTemplate: hasCustomTemplate() });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── ATS Template upload/download ──────────────────────────────────────────
  const templateUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

  app.get("/api/resume-template", (req, res) => {
    if (!hasCustomTemplate()) {
      return res.status(404).json({ message: "No custom template uploaded" });
    }
    const buffer = getCustomTemplate();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="ats-resume-template.docx"`);
    res.send(buffer);
  });

  app.post("/api/resume-template", templateUpload.single("template"), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      if (!req.file.originalname.endsWith(".docx")) {
        return res.status(400).json({ message: "Only .docx files are accepted as templates" });
      }
      saveCustomTemplate(req.file.buffer);
      res.json({ message: "Template saved successfully" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/resume-template", (req, res) => {
    try {
      if (!hasCustomTemplate()) return res.status(404).json({ message: "No template to delete" });
      fs.unlinkSync(CUSTOM_TEMPLATE_PATH);
      res.json({ message: "Template deleted" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/resumes/:id/file", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid resume ID" });
      const resume = await storage.getResume(id);
      if (!resume) return res.status(404).json({ message: "Resume not found" });
      if (resume.filePath) {
        const filePath = path.join(uploadsDir, path.basename(resume.filePath));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      const updated = await storage.updateResume(id, { fileName: "", filePath: "", fileType: "" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/resumes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const resume = await storage.getResume(id);
      if (resume?.filePath) {
        const filePath = path.join(uploadsDir, path.basename(resume.filePath));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      await storage.deleteResume(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/jobs", async (_req, res) => {
    try {
      const list = await storage.getJobs();
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getJob(id);
      if (!job) return res.status(404).json({ message: "Job not found" });
      res.json(job);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/jobs/:id/ats-breakdown", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getJob(id);
      if (!job) return res.status(404).json({ message: "Job not found" });
      const resumes = await storage.getResumes();
      const activeResume = resumes.find(r => r.active) ?? resumes[0];
      if (!activeResume || !job.description) {
        return res.json({ atsScore: job.atsScore ?? 0, technicalSkillsPct: 0, roleKeywordsPct: 0, domainKeywordsPct: 0, keywordAlignmentPct: 0, matchedSkills: [], missingSkills: [], matchedRoleKeywords: [], missingRoleKeywords: [], resumeName: activeResume?.name ?? null });
      }
      const cached = await storage.getAiCache("job-match", id);
      if (cached) {
        return res.json({ ...(cached.result as object), resumeName: activeResume.name, cached: true });
      }
      const jobText = `${job.title}\n${serverStripHtml(job.description)}`;
      const breakdown = calculateATSBreakdown(activeResume.plainText || "", jobText);
      await storage.setAiCache("job-match", id, breakdown);
      await storage.logAiUsage("job-match", id, activeResume.id);
      res.json({ ...breakdown, resumeName: activeResume.name });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/jobs/:id/refresh-description", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getJob(id);
      if (!job) return res.status(404).json({ message: "Job not found" });

      if (!job.applyLink) {
        return res.status(400).json({ message: "No apply link available to refresh from." });
      }

      let fullDescription = "";

      // Greenhouse board API gives us the full HTML description directly
      const ghMatch = job.applyLink.match(/(?:job-boards|boards)\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
      if (ghMatch) {
        const [, board, jobId] = ghMatch;
        try {
          const apiRes = await fetch(
            `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`,
            { headers: { Accept: "application/json" } }
          );
          if (apiRes.ok) {
            const jobData = await apiRes.json() as { content?: string };
            if (jobData.content) fullDescription = jobData.content;
          }
        } catch {
          // Fall through to scraper
        }
      }

      // For non-Greenhouse URLs, or if the API failed, scrape the apply link page
      if (!fullDescription) {
        try {
          const scraped = await scrapeJobFromUrl(job.applyLink);
          fullDescription = scraped.description;
        } catch (scrapeErr: any) {
          return res.status(500).json({ message: `Could not fetch description: ${scrapeErr.message}` });
        }
      }

      if (!fullDescription) {
        return res.status(500).json({ message: "No description content found at the source URL." });
      }

      const updated = await storage.updateJob(id, { description: fullDescription });
      // Clear cached ATS analysis so it re-runs with the new description
      await storage.clearAiCache("job-match", id).catch(() => {});
      res.json({ job: updated, chars: fullDescription.length });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/jobs/check-duplicate", async (req, res) => {
    try {
      const { title, company, applyLink } = req.body;
      const dupCheck = await storage.checkDuplicate(title || "", company || "", applyLink || "");
      res.json({ isDuplicate: dupCheck.isDuplicate, existingJob: dupCheck.existingJob, duplicateReason: dupCheck.reason });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/jobs", async (req, res) => {
    try {
      const parsed = insertJobSchema.parse(req.body);
      const job = await storage.createJob(parsed);
      await storage.logActivity({ jobId: job.id, action: "Job added", details: `${job.title} at ${job.company}` });
      res.json(job);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updatePayload = { ...req.body };

      // Auto-suggest follow-up date when status changes to key stages
      if (req.body.status && !req.body.followUpDate) {
        const existing = await storage.getJob(id);
        if (existing && !existing.followUpDate) {
          const followUpDays: Record<string, number> = {
            Applied: 7,
            Interview: 2,
            "Final Round": 3,
          };
          const days = followUpDays[req.body.status];
          if (days !== undefined) {
            const d = new Date();
            d.setDate(d.getDate() + days);
            updatePayload.followUpDate = d.toISOString().split("T")[0];
          }
        }
      }

      const job = await storage.updateJob(id, updatePayload);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (req.body.status) {
        await storage.logActivity({ jobId: id, action: "Status changed", details: `Changed to ${req.body.status}` });
      }
      res.json(job);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteJob(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/jobs/export/csv", async (_req, res) => {
    try {
      const list = await storage.getJobs();
      const headers = ["Title", "Company", "Source", "Location", "Work Mode", "Date Posted", "Role Classification", "Resume Recommendation", "Fit Label", "Status", "Priority", "Follow-Up Date", "Apply Link", "Notes"];
      const escape = (val: string) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };
      const rows = list.map((j) => [
        j.title, j.company, j.source, j.location, j.workMode, j.datePosted,
        j.roleClassification, j.resumeRecommendation, j.fitLabel, j.status,
        j.priority, j.followUpDate, j.applyLink, j.notes,
      ].map((v) => escape(v ?? "")).join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=jobs_export.csv");
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/answers", async (_req, res) => {
    try {
      const list = await storage.getAnswers();
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/answers", async (req, res) => {
    try {
      const parsed = insertApplicationAnswerSchema.parse(req.body);
      const answer = await storage.createAnswer(parsed);
      res.json(answer);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/answers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const answer = await storage.updateAnswer(id, req.body);
      if (!answer) return res.status(404).json({ message: "Answer not found" });
      res.json(answer);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/answers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAnswer(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ai-usage", async (_req, res) => {
    try {
      const stats = await storage.getAiUsageStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/settings", async (_req, res) => {
    try {
      const s = await storage.getSettings();
      res.json(s);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      await storage.updateSettings(req.body);
      const s = await storage.getSettings();
      res.json(s);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  async function checkDuplicateHelper(title: string, company: string, applyLink: string, datePosted?: string) {
    return storage.checkDuplicate(title, company, applyLink, datePosted);
  }

  app.post("/api/intake/url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ message: "URL is required" });
      }

      let scraped;
      try {
        scraped = await scrapeJobFromUrl(url);
      } catch (err: any) {
        await storage.createImportLog({
          sourceType: "url",
          sourceUrl: url,
          status: "failed",
          errorMessage: err.message || "Failed to scrape URL",
        });
        return res.status(400).json({ message: `Failed to fetch job from URL: ${err.message}` });
      }

      const dupCheck = await checkDuplicateHelper(scraped.title, scraped.company, scraped.applyLink, scraped.datePosted);
      if (dupCheck.isDuplicate) {
        await storage.createImportLog({
          sourceType: "url",
          sourceUrl: url,
          status: "duplicate",
          jobTitle: scraped.title,
          jobCompany: scraped.company,
          duplicateReason: dupCheck.reason ?? "",
          duplicateJobId: dupCheck.existingJob?.id,
        });
        return res.status(409).json({
          message: `This job already exists in your inbox (${dupCheck.reason})`,
          duplicate: true,
          duplicateReason: dupCheck.reason,
          existingJob: dupCheck.existingJob,
        });
      }

      const job = await storage.createJob({
        title: scraped.title,
        company: scraped.company,
        source: scraped.source,
        location: scraped.location,
        workMode: scraped.workMode,
        datePosted: scraped.datePosted,
        description: scraped.description,
        applyLink: scraped.applyLink,
        status: "New",
        importSource: "url",
        importedAt: new Date(),
      });

      await storage.createImportLog({
        sourceType: "url",
        sourceUrl: url,
        status: "success",
        jobId: job.id,
        jobTitle: job.title,
        jobCompany: job.company,
      });

      res.json({ job, message: "Job imported successfully" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/intake/email", async (req, res) => {
    try {
      const { emailContent } = req.body;
      if (!emailContent || typeof emailContent !== "string") {
        return res.status(400).json({ message: "Email content is required" });
      }

      const parsed = parseEmailContent(emailContent);
      if (parsed.length === 0) {
        await storage.createImportLog({
          sourceType: "email",
          status: "failed",
          errorMessage: "No jobs could be parsed from the email content",
        });
        return res.status(400).json({ message: "No jobs could be parsed from the email content. Try using a different format or paste individual job links.", results: [] });
      }

      const results: Array<{ title: string; company: string; status: string; jobId?: number; error?: string }> = [];

      for (const parsed_job of parsed) {
        try {
          if (parsed_job.applyLink && !parsed_job.title) {
            try {
              const scraped = await scrapeJobFromUrl(parsed_job.applyLink);
              parsed_job.title = scraped.title;
              parsed_job.company = scraped.company;
              parsed_job.location = scraped.location;
            } catch {}
          }

          const title = parsed_job.title || "Untitled Position";
          const company = parsed_job.company || "Unknown Company";

          const dupCheck = await checkDuplicateHelper(title, company, parsed_job.applyLink);
          if (dupCheck.isDuplicate) {
            await storage.createImportLog({
              sourceType: "email",
              status: "duplicate",
              jobTitle: title,
              jobCompany: company,
              duplicateReason: dupCheck.reason ?? "",
              duplicateJobId: dupCheck.existingJob?.id,
            });
            results.push({ title, company, status: "duplicate", duplicateReason: dupCheck.reason, existingJobId: dupCheck.existingJob?.id });
            continue;
          }

          const job = await storage.createJob({
            title,
            company,
            source: parsed_job.source || "Email Alert",
            location: parsed_job.location || "",
            applyLink: parsed_job.applyLink || "",
            status: "New",
            importSource: "email",
            importedAt: new Date(),
          });

          await storage.createImportLog({
            sourceType: "email",
            status: "success",
            jobId: job.id,
            jobTitle: job.title,
            jobCompany: job.company,
          });

          results.push({ title: job.title, company: job.company, status: "success", jobId: job.id });
        } catch (err: any) {
          await storage.createImportLog({
            sourceType: "email",
            status: "failed",
            jobTitle: parsed_job.title || "",
            jobCompany: parsed_job.company || "",
            errorMessage: err.message,
          });
          results.push({ title: parsed_job.title || "", company: parsed_job.company || "", status: "failed", error: err.message });
        }
      }

      const imported = results.filter((r) => r.status === "success").length;
      const duplicates = results.filter((r) => r.status === "duplicate").length;
      const failed = results.filter((r) => r.status === "failed").length;

      res.json({
        message: `Processed ${results.length} jobs: ${imported} imported, ${duplicates} duplicates, ${failed} failed`,
        results,
        summary: { total: results.length, imported, duplicates, failed },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/intake/bulk", async (req, res) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Content is required" });
      }

      const items = parseBulkInput(content);
      if (items.length === 0) {
        return res.status(400).json({ message: "No jobs could be parsed from the input", results: [] });
      }

      const results: Array<{ title: string; company: string; status: string; jobId?: number; error?: string }> = [];

      for (const item of items) {
        try {
          let title = item.title || "";
          let company = item.company || "";
          let location = "";
          let description = item.description || "";
          let source = "Manual Import";
          let applyLink = item.url || "";

          if (item.url) {
            try {
              const scraped = await scrapeJobFromUrl(item.url);
              title = scraped.title;
              company = scraped.company;
              location = scraped.location;
              description = scraped.description;
              source = scraped.source;
              applyLink = scraped.applyLink;
            } catch (err: any) {
              await storage.createImportLog({
                sourceType: "bulk",
                sourceUrl: item.url,
                status: "failed",
                errorMessage: `Failed to scrape: ${err.message}`,
              });
              results.push({ title: item.url, company: "", status: "failed", error: `Failed to scrape URL: ${err.message}` });
              continue;
            }
          }

          if (!title) title = "Untitled Position";
          if (!company) company = "Unknown Company";

          const dupCheck = await checkDuplicateHelper(title, company, applyLink);
          if (dupCheck.isDuplicate) {
            await storage.createImportLog({
              sourceType: "bulk",
              status: "duplicate",
              jobTitle: title,
              jobCompany: company,
              duplicateReason: dupCheck.reason ?? "",
              duplicateJobId: dupCheck.existingJob?.id,
            });
            results.push({ title, company, status: "duplicate", duplicateReason: dupCheck.reason, existingJobId: dupCheck.existingJob?.id });
            continue;
          }

          const job = await storage.createJob({
            title,
            company,
            source,
            location,
            description,
            applyLink,
            status: "New",
            importSource: "bulk-paste",
            importedAt: new Date(),
          });

          await storage.createImportLog({
            sourceType: "bulk",
            status: "success",
            jobId: job.id,
            jobTitle: job.title,
            jobCompany: job.company,
          });

          results.push({ title: job.title, company: job.company, status: "success", jobId: job.id });
        } catch (err: any) {
          results.push({ title: item.title || item.url || "", company: item.company || "", status: "failed", error: err.message });
        }
      }

      const imported = results.filter((r) => r.status === "success").length;
      const duplicates = results.filter((r) => r.status === "duplicate").length;
      const failed = results.filter((r) => r.status === "failed").length;

      res.json({
        message: `Processed ${results.length} items: ${imported} imported, ${duplicates} duplicates, ${failed} failed`,
        results,
        summary: { total: results.length, imported, duplicates, failed },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/intake/bulk-urls", async (req, res) => {
    try {
      const { urls } = req.body;
      if (!urls || typeof urls !== "string") {
        return res.status(400).json({ message: "URLs are required (one per line)" });
      }

      const urlList = urls.split("\n").map((u: string) => u.trim()).filter((u: string) => u.length > 0 && (u.startsWith("http://") || u.startsWith("https://")));
      if (urlList.length === 0) {
        return res.status(400).json({ message: "No valid URLs found. Enter one URL per line." });
      }
      if (urlList.length > 200) {
        return res.status(400).json({ message: "Maximum 200 URLs per batch" });
      }

      const results: Array<{ url: string; title: string; company: string; status: string; jobId?: number; error?: string; duplicateReason?: string; existingJobId?: number; importedAt?: string; verifiedInDb?: boolean }> = [];

      for (const url of urlList) {
        try {
          let scraped;
          try {
            scraped = await scrapeJobFromUrl(url);
          } catch (err: any) {
            await storage.createImportLog({
              sourceType: "bulk-urls",
              sourceUrl: url,
              status: "failed",
              errorMessage: err.message || "Failed to scrape URL",
            });
            results.push({ url, title: "", company: "", status: "failed", error: `Failed to scrape: ${err.message}` });
            continue;
          }

          const dupCheck = await checkDuplicateHelper(scraped.title, scraped.company, scraped.applyLink, scraped.datePosted);
          if (dupCheck.isDuplicate) {
            await storage.createImportLog({
              sourceType: "bulk-urls",
              sourceUrl: url,
              status: "duplicate",
              jobTitle: scraped.title,
              jobCompany: scraped.company,
              duplicateReason: dupCheck.reason ?? "",
              duplicateJobId: dupCheck.existingJob?.id,
            });
            results.push({ url, title: scraped.title, company: scraped.company, status: "duplicate", duplicateReason: dupCheck.reason, existingJobId: dupCheck.existingJob?.id });
            continue;
          }

          const job = await storage.createJob({
            title: scraped.title,
            company: scraped.company,
            source: scraped.source,
            location: scraped.location,
            workMode: scraped.workMode,
            datePosted: scraped.datePosted,
            description: scraped.description,
            applyLink: scraped.applyLink,
            status: "New",
            importSource: "bulk-urls",
            importedAt: new Date(),
          });

          const verified = await storage.getJob(job.id);
          if (!verified) {
            await storage.createImportLog({
              sourceType: "bulk-urls",
              sourceUrl: url,
              status: "failed",
              jobTitle: scraped.title,
              jobCompany: scraped.company,
              errorMessage: "Job was not found in database after insert",
            });
            results.push({ url, title: scraped.title, company: scraped.company, status: "failed", error: "Job insert failed verification", jobId: undefined, importedAt: "" });
            continue;
          }

          await storage.createImportLog({
            sourceType: "bulk-urls",
            sourceUrl: url,
            status: "success",
            jobId: verified.id,
            jobTitle: verified.title,
            jobCompany: verified.company,
          });

          results.push({ url, title: verified.title, company: verified.company, status: "success", jobId: verified.id, importedAt: verified.importedAt?.toISOString?.() || new Date().toISOString(), verifiedInDb: true });
        } catch (err: any) {
          await storage.createImportLog({
            sourceType: "bulk-urls",
            sourceUrl: url,
            status: "failed",
            errorMessage: err.message || "Unknown error",
          }).catch(() => {});
          results.push({ url, title: "", company: "", status: "failed", error: err.message });
        }
      }

      const imported = results.filter((r) => r.status === "success").length;
      const duplicates = results.filter((r) => r.status === "duplicate").length;
      const failed = results.filter((r) => r.status === "failed").length;

      res.json({
        message: `Processed ${results.length} URLs: ${imported} imported, ${duplicates} duplicates, ${failed} failed`,
        results,
        summary: { total: results.length, imported, duplicates, failed },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/intake/history", async (_req, res) => {
    try {
      const logs = await storage.getImportLogs();
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/jobs/recalculate-scores", async (_req, res) => {
    try {
      const count = await storage.recalculateAllPriorityScores();
      res.json({ message: `Recalculated scores for ${count} jobs`, count });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/discovery/settings", async (_req, res) => {
    try {
      const s = await storage.getDiscoverySettings();
      res.json(s);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/discovery/settings", async (req, res) => {
    try {
      await storage.updateDiscoverySettings(req.body);
      const s = await storage.getDiscoverySettings();
      res.json(s);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.get("/api/scoring-weights", async (_req, res) => {
    try {
      const weights = await storage.getScoringWeights();
      res.json(weights);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/scoring-weights", async (req, res) => {
    try {
      await storage.updateScoringWeights(req.body);
      const weights = await storage.getScoringWeights();
      res.json(weights);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/discovery/run", async (_req, res) => {
    try {
      if (isDiscoveryRunning()) {
        return res.status(409).json({ message: "A discovery run is already in progress" });
      }
      const runId = await runDiscovery();
      res.json({ runId, message: "Discovery started" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/discovery/stop", async (_req, res) => {
    try {
      stopDiscovery();
      res.json({ message: "Discovery stopped" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/discovery/status", async (_req, res) => {
    try {
      const running = isDiscoveryRunning();
      const runs = await storage.getDiscoveryRuns();
      const latestRun = runs.length > 0 ? runs[0] : null;
      res.json({ running, latestRun });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/discovery/runs", async (_req, res) => {
    try {
      const runs = await storage.getDiscoveryRuns();
      res.json(runs);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/discovery/runs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid run ID" });
      const run = await storage.getDiscoveryRun(id);
      if (!run) return res.status(404).json({ message: "Run not found" });
      res.json(run);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/discovery/results", async (req, res) => {
    try {
      const runId = req.query.runId ? parseInt(req.query.runId as string) : undefined;
      const results = runId ? await storage.getDiscoveryResults(runId) : await storage.getRecentDiscoveryResults();
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/optimize-resume", async (req, res) => {
    try {
      const { jobDescription, resumeText, jobId, resumeId, company, jobTitle } = req.body;
      if (!jobDescription || !resumeText) {
        return res.status(400).json({ message: "jobDescription and resumeText are required" });
      }
      if (process.env.OPENAI_API_KEY) {
        try {
          const result = await aiOptimizeResume(resumeText, jobDescription);

          // Auto-save as a structured resume version when linked to a job
          let savedVersion: any = null;
          if (jobId) {
            const parsedJobId = parseInt(String(jobId));
            if (!isNaN(parsedJobId)) {
              try {
                const versionLabel = await storage.nextVersionLabel(parsedJobId);
                savedVersion = await storage.createResumeVersion({
                  jobId: parsedJobId,
                  resumeId: resumeId ? parseInt(String(resumeId)) : undefined,
                  versionLabel,
                  company: company ?? "",
                  jobTitle: jobTitle ?? "",
                  candidateName: result.sections.name,
                  contact: result.sections.contact,
                  summary: result.sections.summary,
                  skills: result.sections.skills,
                  experience: result.sections.experience,
                  projects: result.sections.projects,
                  education: result.sections.education,
                  certifications: result.sections.certifications,
                  atsScoreBefore: result.beforeScore,
                  atsScoreAfter: result.afterScore,
                });
              } catch (saveErr) {
                console.warn("[optimize-resume] version save failed:", saveErr);
              }
            }
          }

          res.json({ ...result, savedVersion });
        } catch (aiErr: any) {
          const msg: string = aiErr?.message ?? "";
          if (msg.includes("429") || msg.includes("quota") || msg.includes("billing")) {
            return res.status(402).json({ message: "OpenAI quota exceeded. Please check your API key billing at platform.openai.com.", code: "QUOTA_EXCEEDED" });
          }
          throw aiErr;
        }
      } else {
        const result = optimizeResume(resumeText, jobDescription);
        const beforeBreakdown = calculateATSBreakdown(resumeText, jobDescription);
        res.json({
          ...result,
          sections: null,
          savedVersion: null,
          tailoredResume: undefined,
          addedKeywords: [],
          stillMissingKeywords: result.missingKeywords,
          beforeScore: beforeBreakdown.atsScore,
          afterScore: beforeBreakdown.atsScore,
          afterScoreBreakdown: {
            technicalSkillsPct: beforeBreakdown.technicalSkillsPct,
            roleKeywordsPct: beforeBreakdown.roleKeywordsPct,
            domainKeywordsPct: beforeBreakdown.domainKeywordsPct,
            keywordAlignmentPct: beforeBreakdown.keywordAlignmentPct,
            matchedSkills: beforeBreakdown.matchedSkills,
            missingSkills: beforeBreakdown.missingSkills,
            matchedRoleKeywords: beforeBreakdown.matchedRoleKeywords,
            missingRoleKeywords: beforeBreakdown.missingRoleKeywords,
          },
          usedEnrichmentPass: false,
        });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Generate interactive keyword suggestions for a resume + job description
  app.post("/api/generate-suggestions", async (req, res) => {
    try {
      const { jobDescription, resumeText, jobId, sessionStart } = req.body;
      if (!jobDescription || !resumeText) {
        return res.status(400).json({ message: "jobDescription and resumeText are required" });
      }

      // Enforce limit of 2 optimization sessions per job (only on session starts)
      if (jobId && sessionStart) {
        const parsedJobId = parseInt(jobId);
        if (!isNaN(parsedJobId)) {
          const usageCount = await storage.getAiUsageCount("resume-optimization", parsedJobId);
          if (usageCount >= 2) {
            return res.status(429).json({
              message: "AI usage limit reached. Resume optimization has been used 2 times for this job.",
              code: "LIMIT_EXCEEDED",
              usageCount,
              limit: 2,
            });
          }
        }
      }

      // Compute missing keywords using the same scorer (no AI needed for detection)
      const breakdown = calculateATSBreakdown(resumeText, jobDescription);
      const resumeKws = new Set(extractKeywords(resumeText));
      const jobKws = extractKeywords(jobDescription);
      const missingKeywords = [
        ...jobKws.filter(k => !resumeKws.has(k)),
        ...breakdown.missingSkills.filter(k => !jobKws.includes(k)),
      ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 20);

      if (!process.env.OPENAI_API_KEY) {
        return res.json({ suggestions: [], missingKeywords, noAiKey: true });
      }

      try {
        const suggestions = await generateSuggestions(resumeText, jobDescription, missingKeywords);
        // Log AI usage for session starts
        if (jobId && sessionStart) {
          const parsedJobId = parseInt(jobId);
          if (!isNaN(parsedJobId)) {
            await storage.logAiUsage("resume-optimization", parsedJobId);
          }
        }
        res.json({ suggestions, missingKeywords, noAiKey: false });
      } catch (aiErr: any) {
        const msg: string = aiErr?.message ?? "";
        if (msg.includes("429") || msg.includes("quota") || msg.includes("billing")) {
          return res.status(402).json({ message: "OpenAI quota exceeded.", code: "QUOTA_EXCEEDED" });
        }
        throw aiErr;
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Fast ATS score recalculation — no AI, pure scoring logic
  app.post("/api/ats-score", async (req, res) => {
    try {
      const { resumeText, jobDescription } = req.body;
      if (!resumeText || !jobDescription) {
        return res.status(400).json({ message: "resumeText and jobDescription are required" });
      }
      const breakdown = calculateATSBreakdown(resumeText, jobDescription);
      res.json(breakdown);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tailoring/analyze", async (req, res) => {
    try {
      const { jobId, resumeId } = req.body;
      if (!jobId || !resumeId) {
        return res.status(400).json({ message: "jobId and resumeId are required" });
      }
      const parsedJobId = parseInt(jobId);
      const parsedResumeId = parseInt(resumeId);
      if (isNaN(parsedJobId) || isNaN(parsedResumeId)) {
        return res.status(400).json({ message: "Invalid jobId or resumeId" });
      }

      const job = await storage.getJob(parsedJobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const resume = await storage.getResume(parsedResumeId);
      if (!resume) return res.status(404).json({ message: "Resume not found" });

      if (!resume.plainText || resume.plainText.trim().length === 0) {
        return res.status(400).json({ message: "Resume has no text content. Please add plain text to your resume in the Resume Vault." });
      }

      if (!job.description || job.description.trim().length === 0) {
        return res.status(400).json({ message: "Job has no description to analyze against." });
      }

      const result = analyzeAndTailor(resume.plainText, serverStripHtml(job.description), job.roleClassification);

      res.json({
        keywordAnalysis: result.keywordAnalysis,
        improvements: result.improvements,
        tailoredText: result.tailoredText,
        matchBefore: result.matchBefore,
        matchAfter: result.matchAfter,
        improvementSummary: result.improvementSummary,
        resumeName: resume.name,
        jobTitle: job.title,
        jobCompany: job.company,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tailoring/save", async (req, res) => {
    try {
      const { jobId, resumeId, originalText, tailoredText, keywordAnalysis, improvements, matchBefore, matchAfter, improvementSummary } = req.body;

      if (!jobId || !resumeId || !tailoredText) {
        return res.status(400).json({ message: "jobId, resumeId, and tailoredText are required" });
      }
      const parsedJobId = parseInt(jobId);
      const parsedResumeId = parseInt(resumeId);
      if (isNaN(parsedJobId) || isNaN(parsedResumeId)) {
        return res.status(400).json({ message: "Invalid jobId or resumeId" });
      }

      const job = await storage.getJob(parsedJobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      const resume = await storage.getResume(parsedResumeId);
      if (!resume) return res.status(404).json({ message: "Resume not found" });

      const tailored = await storage.createTailoredResume({
        jobId: parsedJobId,
        resumeId: parsedResumeId,
        originalText: originalText || "",
        tailoredText,
        keywordAnalysis: keywordAnalysis || {},
        improvements: improvements || [],
        matchBefore: matchBefore || 0,
        matchAfter: matchAfter || 0,
        improvementSummary: improvementSummary || "",
      });

      await storage.logActivity({
        jobId: parsedJobId,
        action: "Resume tailored",
        details: `Tailored resume saved (match: ${matchBefore}% → ${matchAfter}%)`,
      });

      res.json(tailored);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tailoring/save-as-resume", async (req, res) => {
    try {
      const { tailoredText, name, roleType, originalResumeId } = req.body;

      if (!tailoredText || !name) {
        return res.status(400).json({ message: "tailoredText and name are required" });
      }

      const resume = await storage.createResume({
        name,
        roleType: roleType || "Data Analyst",
        plainText: tailoredText,
        active: true,
      });

      res.json(resume);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tailoring/history/:jobId", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });
      const history = await storage.getTailoredResumes(jobId);
      res.json(history);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/tailoring/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.deleteTailoredResume(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Cover Letter
  // ---------------------------------------------------------------------------
  app.get("/api/jobs/:id/cover-letter", async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });
      const letter = await storage.getCoverLetter(jobId);
      res.json(letter ?? null);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/jobs/:id/cover-letter/generate", async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });

      const { resumeText, resumeId } = req.body;
      if (!resumeText || typeof resumeText !== "string" || !resumeText.trim()) {
        return res.status(400).json({ message: "Resume or Job Description missing." });
      }

      const job = await storage.getJob(jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });

      const cleanDesc = serverStripHtml(job.description);
      if (!cleanDesc.trim()) {
        return res.status(400).json({ message: "Resume or Job Description missing." });
      }

      // Return cached cover letter if already generated for this job+resume combo
      const parsedResumeId = resumeId ? parseInt(resumeId) : undefined;
      const cached = await storage.getAiCache("cover-letter", jobId, parsedResumeId);
      if (cached) {
        return res.json({ content: (cached.result as any).content, cached: true });
      }

      // Enforce limit of 2 cover letter generations per job
      const usageCount = await storage.getAiUsageCount("cover-letter", jobId);
      if (usageCount >= 2) {
        return res.status(429).json({
          message: "AI usage limit reached. Cover letter has been generated 2 times for this job.",
          code: "LIMIT_EXCEEDED",
          usageCount,
          limit: 2,
        });
      }

      const content = await generateCoverLetter(resumeText, cleanDesc, job.company, job.title);
      await storage.setAiCache("cover-letter", jobId, { content }, parsedResumeId);
      await storage.logAiUsage("cover-letter", jobId, parsedResumeId);
      res.json({ content });
    } catch (e: any) {
      if (e.status === 402 || e.code === "insufficient_quota") {
        return res.status(402).json({ message: "OpenAI quota exceeded" });
      }
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/jobs/:id/cover-letter", async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });

      const { content, resumeId } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ message: "content is required" });
      }

      const letter = await storage.upsertCoverLetter({ jobId, resumeId: resumeId ?? 0, content });
      res.json(letter);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/jobs/:id/cover-letter", async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job ID" });
      await storage.deleteCoverLetter(jobId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ---------------------------------------------------------------------------
  // LinkedIn job search via Apify (results returned, not auto-inserted)
  // ---------------------------------------------------------------------------
  app.post("/api/search-jobs", async (req, res) => {
    try {
      const { roles, location, apifyToken, freshness = "24h" } = req.body;

      if (!roles || typeof roles !== "string" || !roles.trim()) {
        return res.status(400).json({ message: "roles is required (comma-separated string)" });
      }
      if (!apifyToken || typeof apifyToken !== "string" || !apifyToken.trim()) {
        return res.status(400).json({ message: "apifyToken is required" });
      }

      const roleList = roles
        .split(",")
        .map((r: string) => r.trim())
        .filter((r: string) => r.length > 0);

      if (roleList.length === 0) {
        return res.status(400).json({ message: "At least one non-empty role is required" });
      }

      console.log(`[LinkedIn Search] ── Starting search ──`);
      console.log(`[LinkedIn Search] Roles: ${roleList.join(", ")}`);
      console.log(`[LinkedIn Search] Location: ${location || "United States"}`);

      const validFreshness = (["24h", "48h", "7d"] as const).includes(freshness) ? freshness as "24h" | "48h" | "7d" : "24h";
      const { jobs, debug } = await searchLinkedInJobs(roleList, location || "", apifyToken.trim(), validFreshness);

      console.log(`[LinkedIn Search] ── Done: ${jobs.length} unique jobs, ${debug.rawItemCount} Apify dataset items (freshness: ${debug.freshnessUsed ?? validFreshness}${debug.fallbackTriggered ? ", fallback triggered" : ""}) ──`);

      res.json({
        results: jobs,
        count: jobs.length,
        rolesSearched: roleList,
        location: location || "United States",
        freshnessRequested: validFreshness,
        freshnessUsed: debug.freshnessUsed ?? validFreshness,
        fallbackTriggered: debug.fallbackTriggered ?? false,
        debug: {
          actorId: debug.actorId,
          rolesSent: debug.rolesSent,
          locationSent: debug.locationSent,
          runId: debug.runId,
          datasetId: debug.datasetId,
          rawItemCount: debug.rawItemCount,
          status: debug.status,
          payloadSent: debug.payload,
          freshnessUsed: debug.freshnessUsed,
          fallbackTriggered: debug.fallbackTriggered,
          error: debug.error,
          rawSampleItem: debug.rawSampleItem ?? null,
          parsedSampleItem: debug.parsedSampleItem ?? null,
        },
      });
    } catch (e: any) {
      console.error(`[LinkedIn Search] Search failed: ${e.message}`);
      res.status(500).json({ message: e.message });
    }
  });

  // POST /api/import-linkedin-jobs
  // Accepts parsed LinkedIn job objects from the frontend, normalizes fields,
  // computes freshness + work mode, deduplicates, inserts, and runs scoring.
  app.post("/api/import-linkedin-jobs", async (req, res) => {
    // ── Helpers (scoped to this route) ──────────────────────────────────────

    function liComputeFreshness(datePosted: string): string {
      if (!datePosted) return "Unknown Date";
      const posted = new Date(datePosted);
      if (isNaN(posted.getTime())) return "Unknown Date";
      const hoursAgo = (Date.now() - posted.getTime()) / (1000 * 60 * 60);
      if (hoursAgo <= 24) return "Fresh 24h";
      if (hoursAgo <= 48) return "Fresh 48h";
      if (hoursAgo <= 72) return "Fresh 72h";
      if (hoursAgo <= 168) return "Fresh 7d";
      return "Fresh 7d"; // actor only returns past-week jobs; treat oldest as 7d not "Too Old"
    }

    // Check location text + description for reliable work-mode signals.
    // Returns blank string if no signal found (don't assume Remote).
    function liInferWorkMode(location: string, description: string, title: string): string {
      const combined = `${location} ${title} ${description}`.toLowerCase();
      // Prioritise explicit hybrid over remote-only mentions
      if (combined.includes("hybrid")) return "Hybrid";
      if (
        combined.includes("fully remote") ||
        combined.includes("100% remote") ||
        combined.includes("work from home") ||
        combined.includes("work remotely")
      ) return "Remote";
      if (combined.includes("remote")) return "Remote";
      if (combined.includes("on-site") || combined.includes("onsite") || combined.includes("in-office") || combined.includes("in office")) return "Onsite";
      return ""; // no reliable signal — leave blank rather than guess
    }

    try {
      const { jobs } = req.body;

      if (!Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ message: "jobs must be a non-empty array" });
      }

      console.log(`[LinkedIn Import] ── Starting import of ${jobs.length} jobs ──`);

      // ── Log the first received job immediately so we can see what the
      // frontend sent and verify field names before any processing ──────────
      const firstReceived = jobs[0] as Record<string, any>;
      console.log(`[LinkedIn Import] ── RECEIVED PAYLOAD (first of ${jobs.length}) ──`);
      console.log(`[LinkedIn Import]   field names: ${Object.keys(firstReceived).join(", ")}`);
      for (const [k, v] of Object.entries(firstReceived)) {
        const descKeys = ["description", "jobDescription", "descriptionText", "body", "text"];
        if (descKeys.includes(k) && typeof v === "string" && v.length > 80) {
          console.log(`[LinkedIn Import]   recv.${k} = (${v.length} chars)`);
        } else {
          console.log(`[LinkedIn Import]   recv.${k} = ${JSON.stringify(v)}`);
        }
      }

      // Generate a scan batch label (mirrors discovery.ts pattern)
      const now = new Date();
      const dayName = now.toLocaleDateString("en-US", { weekday: "short" });
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const year = String(now.getFullYear());
      const scanDate = `${year}-${month}-${day}`;
      const scanBatchLabel = `LinkedIn - ${dayName} - ${month}/${day}/${year}`;

      let imported = 0;
      let duplicates = 0;
      let failed = 0;
      let repaired = 0;
      let insufficient = 0;   // missing title AND URL AND jobUrl
      let junk = 0;            // login-page / portal redirects
      let missingIds = 0;
      let debugLogged = false;
      // How many of each category to include in per-job detail arrays
      const MAX_DETAIL = 20;
      const importedJobs: { id: number; title: string; company: string; dedupeKey: string }[] = [];
      const duplicateDetails: { title: string; company: string; reason: string }[] = [];
      const repairedDetails: { id: number; title: string; company: string }[] = [];
      const failedDetails: { title: string; company: string; error: string }[] = [];
      const insufficientDetails: { rawKeys: string }[] = [];
      // Full per-job skip log (up to MAX_DETAIL entries) for debug response
      const skipLog: { title: string; reason: string }[] = [];

      // Helper: try a list of field name candidates, return first non-empty trimmed value
      const pickField = (obj: Record<string, any>, ...keys: string[]): string => {
        for (const key of keys) {
          const val = obj[key];
          if (val !== null && val !== undefined) {
            const s = String(val).trim();
            if (s) return s;
          }
        }
        return "";
      };

      for (const raw of jobs) {
        // ── Guard: skip records that are clearly not real job listings ─────
        // LinkedIn login-redirect pages ("LinkedIn Login, Sign in | LinkedIn")
        // and ATS portal homepages happen when the scraper followed a redirect
        // instead of landing on a real job posting.
        const rawPageTitleGuard = String(raw.title ?? "").trim();
        if (/sign[\s-]*in|log[\s-]*in|linkedin login|careers\s+portal/i.test(rawPageTitleGuard)) {
          junk++;
          if (insufficientDetails.length < MAX_DETAIL) {
            insufficientDetails.push({ rawKeys: `junk_page_title: ${rawPageTitleGuard.slice(0, 60)}` });
          }
          if (skipLog.length < MAX_DETAIL) skipLog.push({ title: rawPageTitleGuard.slice(0, 60), reason: "junk_page_title" });
          console.log(`[LinkedIn Import] SKIP [junk] page title is login/portal: "${rawPageTitleGuard.slice(0, 80)}"`);
          continue;
        }

        // ── Normalize fields ───────────────────────────────────────────────
        // "rawTitle" — try all semantic title fields WITHOUT applying "Untitled Position"
        // fallback yet. We need to know if ANY title signal was found to make quality
        // decisions before applying the placeholder.
        const rawTitle: string =
          pickField(raw,
            "title",           // parseRawJob output (clean title from page-title parser)
            "jobTitle",        // cheap_scraper actor
            "positionTitle",
            "position",
            "job_title",
            "jobName",
            "postingTitle",
            "jobPostingTitle",
            "headline",
          );
        const title: string = rawTitle || "Untitled Position";

        const rawCompany: string =
          pickField(raw,
            "company",         // parseRawJob output
            "companyName",     // cheap_scraper actor
            "employerName",    // user-observed alternate field
            "company_name",
            "employer",
            "organization",
            "hiringOrganization",
            "companyDisplayName",
            "organizationName",
          );
        const company: string = rawCompany || "Unknown Company";

        const location: string =
          pickField(raw,
            "location",
            "formattedLocation",  // user-observed alternate field
            "jobLocation",
            "city",
            "geoText",
            "locationText",
            "country",
          );

        const applyLink: string =
          pickField(raw,
            "applyLink",       // parseRawJob output
            "applyUrl",        // cheap_scraper actor (direct apply URL)
            "jobUrl",          // cheap_scraper actor (LinkedIn posting URL)
            "applicationUrl",
            "externalApplyLink",
            "externalUrl",
            "redirectUrl",
            "jobPostingUrl",
            "postingUrl",
            "href",
            "canonicalUrl",
            "url",
            "link",
            "jobLink",
          );

        const description: string =
          pickField(raw,
            "description",     // parseRawJob output
            "jobDescription",  // cheap_scraper actor
            "descriptionText",
            "snippet",
            "summary",
            "details",
          );

        const datePosted: string =
          pickField(raw,
            "datePosted",      // parseRawJob output
            "publishedAt",     // cheap_scraper actor (ISO 8601)
            "listedAt",        // user-observed alternate field
            "postedAt",
            "date",
            "postedTime",
            "listedAtStr",
            "timeAgo",
            "posted",
            "createdAt",
          );

        // ── jobUrl (LinkedIn posting URL — used for dedup fallback) ───────
        const jobUrl: string =
          pickField(raw,
            "jobUrl",          // parseRawJob output + cheap_scraper actor field
            "linkedinUrl",
            "url",
            "link",
            "jobLink",
          );

        // ── dedupeKey: prefer the pre-computed value from parseRawJob, ────
        // otherwise compute it here using the same three-tier logic.
        const rawDedupeKey = pickField(raw, "dedupeKey");
        let dedupeKey = rawDedupeKey;
        if (!dedupeKey) {
          const liIdFromJobUrl  = jobUrl.match(/linkedin\.com\/jobs\/view\/(\d+)/i)?.[1] ?? "";
          const liIdFromApply   = applyLink.match(/linkedin\.com\/jobs\/view\/(\d+)/i)?.[1] ?? "";
          const liJobId = liIdFromJobUrl || liIdFromApply;
          if (liJobId) {
            dedupeKey = `li:${liJobId}`;
          } else if (applyLink || jobUrl) {
            const canonicalUrl = applyLink || jobUrl;
            try {
              const parsed2 = new URL(canonicalUrl);
              parsed2.hash = "";
              ["utm_source","utm_medium","utm_campaign","trk","trkCampaign"].forEach(p => parsed2.searchParams.delete(p));
              const pathname = parsed2.pathname.replace(/\/+$/, "") || "/";
              const search = Array.from(parsed2.searchParams.entries()).sort().map(([k2,v2]) => `${k2}=${v2}`).join("&");
              dedupeKey = `url:${parsed2.hostname.toLowerCase()}${pathname}${search ? "?" + search : ""}`;
            } catch {
              dedupeKey = `url:${canonicalUrl.toLowerCase().trim().replace(/\/+$/, "")}`;
            }
          } else if (rawTitle && rawCompany) {
            // Only fingerprint if we have real title+company (not placeholders)
            dedupeKey = `fp:${rawTitle.toLowerCase().trim()}|${rawCompany.toLowerCase().trim()}|${datePosted}`;
          }
        }

        // ── Debug: log FIRST item fully (before any skip) ─────────────────
        // IMPORTANT: this runs BEFORE the quality filter so we always see
        // the actual field values even when jobs are being skipped.
        if (!debugLogged) {
          console.log(`[LinkedIn Import] ── RAW IMPORT ITEM (first of batch) ──`);
          console.log(`[LinkedIn Import]   field names: ${Object.keys(raw).join(", ")}`);
          for (const [k, v] of Object.entries(raw as Record<string, any>)) {
            const descKeys = ["description", "jobDescription", "descriptionText", "body", "text"];
            if (descKeys.includes(k)) {
              console.log(`[LinkedIn Import]   raw.${k} = (${String(v ?? "").length} chars)`);
            } else {
              console.log(`[LinkedIn Import]   raw.${k} = ${JSON.stringify(v)}`);
            }
          }
          console.log(`[LinkedIn Import] ── Normalized from first item ──`);
          console.log(`[LinkedIn Import]   rawTitle       = ${JSON.stringify(rawTitle)}`);
          console.log(`[LinkedIn Import]   title          = ${JSON.stringify(title)}`);
          console.log(`[LinkedIn Import]   rawCompany     = ${JSON.stringify(rawCompany)}`);
          console.log(`[LinkedIn Import]   company        = ${JSON.stringify(company)}`);
          console.log(`[LinkedIn Import]   location       = ${JSON.stringify(location)}`);
          console.log(`[LinkedIn Import]   applyLink      = ${JSON.stringify(applyLink)}`);
          console.log(`[LinkedIn Import]   jobUrl         = ${JSON.stringify(jobUrl)}`);
          console.log(`[LinkedIn Import]   datePosted     = ${JSON.stringify(datePosted)}`);
          console.log(`[LinkedIn Import]   dedupeKey      = ${JSON.stringify(dedupeKey)}`);
          debugLogged = true;
        }

        // ── Flag & skip jobs with no usable data ──────────────────────────
        // A job with no URL AND no title is completely unidentifiable — saving
        // it would create a "Untitled Position / Unknown Company" row that
        // cannot be deduped, scored, or acted upon.
        if (!rawTitle && !applyLink && !jobUrl) {
          insufficient++;
          missingIds++;
          if (insufficientDetails.length < MAX_DETAIL) {
            insufficientDetails.push({ rawKeys: Object.keys(raw).join(", ") });
          }
          if (skipLog.length < MAX_DETAIL) skipLog.push({ title: "(no title)", reason: `missing_fields — rawTitle="${rawTitle}" applyLink="${applyLink}" jobUrl="${jobUrl}"` });
          console.log(`[LinkedIn Import] SKIP [insufficient] no title AND no URL — rawTitle="${rawTitle}" applyLink="${applyLink}" jobUrl="${jobUrl}"`);
          continue;
        }

        // ── Flag jobs that have a URL but no identifier ────────────────────
        if (!dedupeKey && !applyLink && !jobUrl) missingIds++;

        // ── Enrichment: freshness ──────────────────────────────────────────
        const freshnessLabel = liComputeFreshness(datePosted);

        // ── Enrichment: work mode ──────────────────────────────────────────
        const workMode = liInferWorkMode(location, description, title);

        try {
          const dupCheck = await storage.checkDuplicate(title, company, applyLink, datePosted || undefined, dedupeKey || undefined);

          if (dupCheck.isDuplicate) {
            const existingJob = dupCheck.existingJob;

            // ── Repair on re-import ──────────────────────────────────────
            // If the job already in the DB has placeholder data (saved from a
            // bad scrape) but this incoming record has real values, update the
            // existing row with the better data and re-run scoring.
            const incomingHasRealTitle   = rawTitle.length > 0;
            const incomingHasRealCompany = rawCompany.length > 0;
            const existingIsBad = existingJob &&
              (existingJob.title === "Untitled Position" || existingJob.company === "Unknown Company");

            if (existingJob && existingIsBad && (incomingHasRealTitle || incomingHasRealCompany)) {
              const repairData = {
                title:       incomingHasRealTitle   ? title   : existingJob.title,
                company:     incomingHasRealCompany ? company : existingJob.company,
                location:    location   || existingJob.location   || "",
                description: description || existingJob.description || "",
                applyLink:   applyLink  || existingJob.applyLink  || "",
                dedupeKey:   dedupeKey  || existingJob.dedupeKey  || "",
                freshnessLabel,
                workMode:    workMode   || existingJob.workMode   || "",
              };
              // Re-run local scoring with the corrected data
              const { matchScoreNumeric: _ms, ...reclassified } = (storage as any).classifyAndScore(
                { ...existingJob, ...repairData },
              );
              await storage.updateJob(existingJob.id, {
                ...repairData,
                fitLabel:                reclassified.fitLabel,
                applyPriorityScore:      reclassified.applyPriorityScore,
                applyPriorityLabel:      reclassified.applyPriorityLabel,
                applyPriorityExplanation: reclassified.applyPriorityExplanation,
                roleClassification:      reclassified.roleClassification,
                resumeRecommendation:    reclassified.resumeRecommendation,
              });
              repaired++;
              if (repairedDetails.length < MAX_DETAIL) {
                repairedDetails.push({ id: existingJob.id, title: repairData.title, company: repairData.company });
              }
              console.log(`[LinkedIn Import] REPAIR job #${existingJob.id} "${repairData.title}" @ ${repairData.company} (was placeholder data)`);
              continue;
            }

            // Normal duplicate — skip
            duplicates++;
            if (duplicateDetails.length < MAX_DETAIL) {
              duplicateDetails.push({ title, company, reason: dupCheck.reason ?? "duplicate" });
            }
            if (skipLog.length < MAX_DETAIL) skipLog.push({ title: `${title} @ ${company}`, reason: `duplicate — ${dupCheck.reason ?? "duplicate"}` });
            console.log(`[LinkedIn Import] SKIP [dup/${dupCheck.reason ?? "duplicate"}] "${title}" @ ${company}`);
            continue;
          }

          // ── Insert new job ─────────────────────────────────────────────
          // createJob calls classifyAndScore internally — roleClassification,
          // fitLabel, resumeRecommendation, applyPriorityScore, workMode, etc.
          const job = await storage.createJob({
            title,
            company,
            source: "LinkedIn",
            location,
            description,
            applyLink,
            dedupeKey,
            datePosted: datePosted || undefined,
            freshnessLabel,
            workMode,
            status: "New",
            importSource: "linkedin-search",
            importedAt: new Date(),
            scanBatchLabel,
            scanDate,
          });

          imported++;
          importedJobs.push({ id: job.id, title: job.title, company: job.company, dedupeKey: job.dedupeKey });
          console.log(`[LinkedIn Import] INSERT #${job.id} "${job.title}" @ ${job.company} | fit=${job.fitLabel} | score=${job.applyPriorityScore} | key=${job.dedupeKey}`);

          // Full debug for first inserted job
          if (imported === 1) {
            console.log(`[LinkedIn Import] ── Debug: first saved job ──`);
            console.log(`[LinkedIn Import]   id             = ${job.id}`);
            console.log(`[LinkedIn Import]   title          = ${JSON.stringify(job.title)}`);
            console.log(`[LinkedIn Import]   company        = ${JSON.stringify(job.company)}`);
            console.log(`[LinkedIn Import]   location       = ${JSON.stringify(job.location)}`);
            console.log(`[LinkedIn Import]   applyLink      = ${JSON.stringify(job.applyLink)}`);
            console.log(`[LinkedIn Import]   dedupeKey      = ${JSON.stringify(job.dedupeKey)}`);
            console.log(`[LinkedIn Import]   datePosted     = ${JSON.stringify(job.datePosted)}`);
            console.log(`[LinkedIn Import]   freshnessLabel = ${JSON.stringify(job.freshnessLabel)}`);
            console.log(`[LinkedIn Import]   fitLabel       = ${JSON.stringify(job.fitLabel)}`);
            console.log(`[LinkedIn Import]   applyPriority  = ${JSON.stringify(job.applyPriorityScore)}`);
            console.log(`[LinkedIn Import]   roleClass      = ${JSON.stringify(job.roleClassification)}`);
            console.log(`[LinkedIn Import]   workMode       = ${JSON.stringify(job.workMode)}`);
          }
        } catch (err: any) {
          failed++;
          if (failedDetails.length < MAX_DETAIL) {
            failedDetails.push({ title, company, error: err?.message ?? "Unknown error" });
          }
          console.log(`[LinkedIn Import] FAIL "${title}" @ ${company} — ${err?.message ?? "Unknown error"}`);
        }
      }

      console.log(`[LinkedIn Import] ── Batch summary (${jobs.length} received) ──`);
      console.log(`[LinkedIn Import]   inserted     = ${imported}`);
      console.log(`[LinkedIn Import]   repaired     = ${repaired}`);
      console.log(`[LinkedIn Import]   duplicates   = ${duplicates}`);
      console.log(`[LinkedIn Import]   failed       = ${failed}`);
      console.log(`[LinkedIn Import]   insufficient = ${insufficient}`);
      console.log(`[LinkedIn Import]   junk         = ${junk}`);
      console.log(`[LinkedIn Import]   missing IDs  = ${missingIds}`);
      if (skipLog.length > 0) {
        console.log(`[LinkedIn Import] ── Skip log (up to ${MAX_DETAIL}) ──`);
        skipLog.forEach((s, i) => console.log(`[LinkedIn Import]   [${i + 1}] ${s.title} → ${s.reason}`));
      }

      res.json({
        imported,
        duplicates,
        failed,
        repaired,
        insufficient,
        junk,
        missingIds,
        importedJobs,
        duplicateDetails,
        repairedDetails,
        failedDetails,
        insufficientDetails,
        skipLog,
        scanBatchLabel,
        scanDate,
        rawCount: jobs.length,
        // Flat summary for easy UI display
        totalSelected: jobs.length,
        inserted: imported,
        skippedDuplicates: duplicates,
        skippedInvalid: junk + insufficient,
        skippedMissingFields: insufficient,
        errors: failed,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Analytics ────────────────────────────────────────────────────────────────

  app.get("/api/analytics", async (req, res) => {
    try {
      const [allJobs, allVersions, allContacts] = await Promise.all([
        storage.getJobs(),
        storage.getResumeVersions(),
        storage.getContacts(),
      ]);

      const APPLIED_STATUSES = new Set(["Applied", "Interview", "Final Round", "Offer", "Rejected", "No Response"]);
      const INTERVIEW_STATUSES = new Set(["Interview", "Final Round", "Offer"]);

      // ── Source split ──────────────────────────────────────────────────────────
      const totalJobsScraped = allJobs.filter(j => j.source === "LinkedIn" || j.source === "Apify" || j.source === "Discovery").length;
      const totalJobsImported = allJobs.filter(j => j.importSource || (j.source !== "LinkedIn" && j.source !== "Apify" && j.source !== "Discovery")).length;

      // ── Application totals ────────────────────────────────────────────────────
      const applied = allJobs.filter(j => APPLIED_STATUSES.has(j.status));
      const interviews = allJobs.filter(j => INTERVIEW_STATUSES.has(j.status));
      const totalApplications = applied.length;
      const totalInterviews = interviews.length;
      const conversionRate = totalApplications > 0 ? Math.round((totalInterviews / totalApplications) * 100) : 0;

      // ── Avg ATS score of applied jobs ─────────────────────────────────────────
      const atsApplied = applied.filter(j => (j.atsScoreAtApply ?? 0) > 0).map(j => j.atsScoreAtApply!);
      const avgAtsScoreApplied = atsApplied.length > 0 ? Math.round(atsApplied.reduce((a, b) => a + b, 0) / atsApplied.length) : 0;

      // ── Time metrics ──────────────────────────────────────────────────────────
      const postedToApplied: number[] = [];
      const appliedToInterview: number[] = [];

      for (const j of applied) {
        if (j.datePosted && j.dateApplied) {
          const days = (new Date(j.dateApplied).getTime() - new Date(j.datePosted).getTime()) / 86400000;
          if (days >= 0 && days < 365) postedToApplied.push(days);
        }
        if (j.dateApplied && j.interviewDate) {
          const days = (new Date(j.interviewDate).getTime() - new Date(j.dateApplied).getTime()) / 86400000;
          if (days >= 0 && days < 365) appliedToInterview.push(days);
        }
      }

      const avgDaysPostedToApplied = postedToApplied.length > 0
        ? Math.round(postedToApplied.reduce((a, b) => a + b, 0) / postedToApplied.length)
        : null;
      const avgDaysAppliedToInterview = appliedToInterview.length > 0
        ? Math.round(appliedToInterview.reduce((a, b) => a + b, 0) / appliedToInterview.length)
        : null;

      // ── Applications per week (last 16 weeks) ─────────────────────────────────
      const weekMap: Record<string, number> = {};
      for (let w = 15; w >= 0; w--) {
        const d = new Date();
        d.setDate(d.getDate() - w * 7);
        const mon = new Date(d);
        mon.setDate(d.getDate() - d.getDay() + 1);
        const key = mon.toISOString().split("T")[0];
        weekMap[key] = 0;
      }
      for (const j of applied) {
        if (!j.dateApplied) continue;
        const d = new Date(j.dateApplied);
        const mon = new Date(d);
        mon.setDate(d.getDate() - d.getDay() + 1);
        const key = mon.toISOString().split("T")[0];
        if (key in weekMap) weekMap[key]++;
      }
      const applicationsPerWeek = Object.entries(weekMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, count]) => ({ week, count }));

      // ── Jobs scraped per day (last 30 days) ────────────────────────────────────
      const dayMap: Record<string, number> = {};
      for (let d = 29; d >= 0; d--) {
        const dt = new Date();
        dt.setDate(dt.getDate() - d);
        dayMap[dt.toISOString().split("T")[0]] = 0;
      }
      for (const j of allJobs) {
        const key = new Date(j.createdAt).toISOString().split("T")[0];
        if (key in dayMap) dayMap[key]++;
      }
      const jobsPerDay = Object.entries(dayMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count }));

      // ── ATS score distribution (applied jobs with scores) ─────────────────────
      const buckets = [
        { range: "0–19", min: 0, max: 19 },
        { range: "20–39", min: 20, max: 39 },
        { range: "40–59", min: 40, max: 59 },
        { range: "60–69", min: 60, max: 69 },
        { range: "70–79", min: 70, max: 79 },
        { range: "80–89", min: 80, max: 89 },
        { range: "90–100", min: 90, max: 100 },
      ];
      const atsAll = applied.filter(j => (j.atsScoreAtApply ?? 0) > 0);
      const atsDistribution = buckets.map(b => ({
        range: b.range,
        count: atsAll.filter(j => j.atsScoreAtApply! >= b.min && j.atsScoreAtApply! <= b.max).length,
      }));

      // ── Resume version vs interview rate ──────────────────────────────────────
      const versionMap: Record<number, { label: string; applied: number; interviews: number }> = {};
      for (const j of applied) {
        if (!j.resumeVersionId) continue;
        if (!versionMap[j.resumeVersionId]) {
          const v = allVersions.find(v => v.id === j.resumeVersionId);
          versionMap[j.resumeVersionId] = {
            label: v ? `${v.versionLabel} (${v.jobTitle || v.company || "?"})` : `v#${j.resumeVersionId}`,
            applied: 0,
            interviews: 0,
          };
        }
        versionMap[j.resumeVersionId].applied++;
        if (INTERVIEW_STATUSES.has(j.status)) versionMap[j.resumeVersionId].interviews++;
      }
      const versionInterviewRate = Object.values(versionMap).map(v => ({
        version: v.label,
        applied: v.applied,
        interviews: v.interviews,
        rate: v.applied > 0 ? Math.round((v.interviews / v.applied) * 100) : 0,
      })).sort((a, b) => b.rate - a.rate).slice(0, 10);

      // ── Top companies applied ─────────────────────────────────────────────────
      const companyMap: Record<string, number> = {};
      for (const j of applied) {
        if (j.company) companyMap[j.company] = (companyMap[j.company] ?? 0) + 1;
      }
      const topCompanies = Object.entries(companyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([company, count]) => ({ company, count }));

      // ── Top job titles applied ────────────────────────────────────────────────
      // Normalize: strip "Senior", "Junior", "Lead" etc. for cleaner grouping
      const titleMap: Record<string, number> = {};
      for (const j of applied) {
        if (j.title) {
          const t = j.title.trim();
          titleMap[t] = (titleMap[t] ?? 0) + 1;
        }
      }
      const topTitles = Object.entries(titleMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([title, count]) => ({ title, count }));

      // ── ATS improvement from versions ─────────────────────────────────────────
      const atsImprovements = allVersions
        .filter(v => v.atsScoreBefore > 0 && v.atsScoreAfter > v.atsScoreBefore)
        .map(v => ({ label: v.versionLabel, before: v.atsScoreBefore, after: v.atsScoreAfter, delta: v.atsScoreAfter - v.atsScoreBefore }))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 8);

      // ── Status funnel ─────────────────────────────────────────────────────────
      const statusFunnel = [
        "New", "Reviewed", "Ready to Apply", "Saved",
        "Applied", "Interview", "Final Round", "Offer",
        "Rejected", "No Response",
      ].map(s => ({ status: s, count: allJobs.filter(j => j.status === s).length }));

      // ── Pipeline funnel (linear, descending) ──────────────────────────────────
      const totalOffers = allJobs.filter(j => j.status === "Offer").length;
      const totalReviewed = allJobs.filter(j => j.status !== "New").length;
      const funnelStages = [
        { stage: "Scraped", count: totalJobsScraped },
        { stage: "Imported", count: allJobs.length },
        { stage: "Reviewed", count: totalReviewed },
        { stage: "Applied", count: totalApplications },
        { stage: "Interviews", count: totalInterviews },
        { stage: "Offers", count: totalOffers },
      ];
      const pipelineFunnel = funnelStages.map((s, i) => ({
        ...s,
        conversionFromPrev: i === 0 ? 100 : funnelStages[i - 1].count > 0
          ? Math.round((s.count / funnelStages[i - 1].count) * 100)
          : 0,
      }));

      // ── Interviews per month (last 12 months) ─────────────────────────────────
      const monthMap: Record<string, number> = {};
      for (let m = 11; m >= 0; m--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - m);
        const key = d.toISOString().slice(0, 7);
        monthMap[key] = 0;
      }
      for (const j of interviews) {
        const dateStr = j.interviewDate ?? j.dateApplied;
        if (!dateStr) continue;
        const key = new Date(dateStr).toISOString().slice(0, 7);
        if (key in monthMap) monthMap[key]++;
      }
      const interviewsPerMonth = Object.entries(monthMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, count]) => ({ month, count }));

      // ── Work mode breakdown (applied jobs) ────────────────────────────────────
      const workModeMap: Record<string, number> = {};
      for (const j of applied) {
        const mode = (j.workMode || "Unknown").trim();
        workModeMap[mode] = (workModeMap[mode] ?? 0) + 1;
      }
      const workModeBreakdown = Object.entries(workModeMap)
        .sort((a, b) => b[1] - a[1])
        .map(([mode, count]) => ({ mode, count }));

      // ── Avg days between applications ─────────────────────────────────────────
      const appDates = applied
        .filter(j => j.dateApplied)
        .map(j => new Date(j.dateApplied!).getTime())
        .sort((a, b) => a - b);
      let avgDaysBetweenApplications: number | null = null;
      if (appDates.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < appDates.length; i++) {
          gaps.push((appDates[i] - appDates[i - 1]) / 86400000);
        }
        avgDaysBetweenApplications = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
      }

      // ── Applications per day (last 30 days) ───────────────────────────────────
      const appDayMap: Record<string, number> = {};
      for (let d = 29; d >= 0; d--) {
        const dt = new Date();
        dt.setDate(dt.getDate() - d);
        appDayMap[dt.toISOString().split("T")[0]] = 0;
      }
      for (const j of applied) {
        if (!j.dateApplied) continue;
        const key = new Date(j.dateApplied).toISOString().split("T")[0];
        if (key in appDayMap) appDayMap[key]++;
      }
      const applicationsPerDay = Object.entries(appDayMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count }));

      // ── Applications by role type ─────────────────────────────────────────────
      const roleTypeMap: Record<string, number> = {};
      for (const j of applied) {
        const role = (j.roleClassification || "Other").trim();
        roleTypeMap[role] = (roleTypeMap[role] ?? 0) + 1;
      }
      const applicationsByRoleType = Object.entries(roleTypeMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([role, count]) => ({ role, count }));

      // ── Job Market: top titles across ALL jobs ────────────────────────────────
      const allTitleMap: Record<string, number> = {};
      for (const j of allJobs) {
        if (j.title) allTitleMap[j.title.trim()] = (allTitleMap[j.title.trim()] ?? 0) + 1;
      }
      const jobMarketTopTitles = Object.entries(allTitleMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([title, count]) => ({ title, count }));

      // ── Job Market: top companies hiring across ALL jobs ──────────────────────
      const allCompanyMap: Record<string, number> = {};
      for (const j of allJobs) {
        if (j.company) allCompanyMap[j.company] = (allCompanyMap[j.company] ?? 0) + 1;
      }
      const jobMarketTopCompanies = Object.entries(allCompanyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([company, count]) => ({ company, count }));

      // ── Job Market: most common skills in job descriptions ────────────────────
      const SKILL_KEYWORDS = [
        "SQL", "Python", "Excel", "Power BI", "Tableau", "R", "Machine Learning",
        "JavaScript", "TypeScript", "React", "Node.js", "Java", "AWS", "Azure", "GCP",
        "Databricks", "Snowflake", "dbt", "Spark", "PySpark", "ETL", "A/B Testing",
        "Pandas", "NumPy", "Scikit-learn", "TensorFlow", "Statistics", "NLP",
        "Power Query", "DAX", "JIRA", "Agile", "Scrum", "Git", "Docker",
        "PostgreSQL", "MySQL", "MongoDB", "Kafka", "Airflow", "Looker", "Redshift",
      ];
      const skillMap: Record<string, number> = {};
      for (const j of allJobs) {
        if (!j.description) continue;
        const desc = j.description.toLowerCase();
        for (const skill of SKILL_KEYWORDS) {
          if (desc.includes(skill.toLowerCase())) {
            skillMap[skill] = (skillMap[skill] ?? 0) + 1;
          }
        }
      }
      const jobMarketTopSkills = Object.entries(skillMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([skill, count]) => ({ skill, count }));

      // ── Job Market: avg match score per role type ─────────────────────────────
      const roleScoreMap: Record<string, { total: number; count: number }> = {};
      for (const j of allJobs) {
        if (!j.roleClassification || j.applyPriorityScore <= 0) continue;
        if (!roleScoreMap[j.roleClassification]) roleScoreMap[j.roleClassification] = { total: 0, count: 0 };
        roleScoreMap[j.roleClassification].total += j.applyPriorityScore;
        roleScoreMap[j.roleClassification].count++;
      }
      const avgMatchScoreByRole = Object.entries(roleScoreMap)
        .map(([role, { total, count }]) => ({ role, avgScore: Math.round(total / count), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // ── ATS score vs interview rate (by bucket) ───────────────────────────────
      const atsVsInterviewRate = buckets.map(b => {
        const inBucket = atsAll.filter(j => j.atsScoreAtApply! >= b.min && j.atsScoreAtApply! <= b.max);
        const interviewedInBucket = inBucket.filter(j => INTERVIEW_STATUSES.has(j.status));
        return {
          range: b.range,
          applied: inBucket.length,
          interviews: interviewedInBucket.length,
          rate: inBucket.length > 0 ? Math.round((interviewedInBucket.length / inBucket.length) * 100) : 0,
        };
      });

      const bestVersion = versionInterviewRate.length > 0 ? versionInterviewRate[0] : null;

      // ── Skills trend per month (last 6 months) ────────────────────────────────
      const TOP_TREND_SKILLS = ["SQL", "Python", "Excel", "Power BI", "Tableau", "R", "Machine Learning", "AWS", "Databricks", "Snowflake"];
      const trendMonths: string[] = [];
      for (let m = 5; m >= 0; m--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - m);
        trendMonths.push(d.toISOString().slice(0, 7));
      }
      const skillsTrend = trendMonths.map(month => {
        const monthJobs = allJobs.filter(j => new Date(j.createdAt).toISOString().slice(0, 7) === month);
        const entry: Record<string, number | string> = { month };
        for (const skill of TOP_TREND_SKILLS) {
          entry[skill] = monthJobs.filter(j => j.description?.toLowerCase().includes(skill.toLowerCase())).length;
        }
        return entry;
      });

      // ── Source Analytics ──────────────────────────────────────────────────────
      const sourceMap: Record<string, { applied: number; interviews: number; offers: number }> = {};
      for (const j of applied) {
        const src = (j.source || "Unknown").trim();
        if (!sourceMap[src]) sourceMap[src] = { applied: 0, interviews: 0, offers: 0 };
        sourceMap[src].applied++;
        if (INTERVIEW_STATUSES.has(j.status)) sourceMap[src].interviews++;
        if (j.status === "Offer") sourceMap[src].offers++;
      }
      const sourceAnalytics = Object.entries(sourceMap)
        .map(([source, v]) => ({
          source,
          applied: v.applied,
          interviews: v.interviews,
          offers: v.offers,
          interviewRate: v.applied > 0 ? Math.round((v.interviews / v.applied) * 100) : 0,
          offerRate: v.applied > 0 ? Math.round((v.offers / v.applied) * 100) : 0,
        }))
        .sort((a, b) => b.applied - a.applied);
      const bestSource = sourceAnalytics.length > 0
        ? [...sourceAnalytics].sort((a, b) => b.interviewRate - a.interviewRate)[0]
        : null;

      // ── Enhanced Resume Version Performance (with offers) ────────────────────
      const versionMapFull: Record<number, { label: string; applied: number; interviews: number; offers: number; ats: number[] }> = {};
      for (const j of applied) {
        if (!j.resumeVersionId) continue;
        if (!versionMapFull[j.resumeVersionId]) {
          const v = allVersions.find(v => v.id === j.resumeVersionId);
          versionMapFull[j.resumeVersionId] = {
            label: v ? `${v.versionLabel} — ${v.jobTitle || v.company || "?"}` : `v#${j.resumeVersionId}`,
            applied: 0,
            interviews: 0,
            offers: 0,
            ats: [],
          };
        }
        versionMapFull[j.resumeVersionId].applied++;
        if (INTERVIEW_STATUSES.has(j.status)) versionMapFull[j.resumeVersionId].interviews++;
        if (j.status === "Offer") versionMapFull[j.resumeVersionId].offers++;
        if (j.atsScoreAtApply && j.atsScoreAtApply > 0) versionMapFull[j.resumeVersionId].ats.push(j.atsScoreAtApply);
      }
      const versionPerformance = Object.values(versionMapFull).map(v => ({
        version: v.label,
        applied: v.applied,
        interviews: v.interviews,
        offers: v.offers,
        interviewRate: v.applied > 0 ? Math.round((v.interviews / v.applied) * 100) : 0,
        offerRate: v.applied > 0 ? Math.round((v.offers / v.applied) * 100) : 0,
        avgAts: v.ats.length > 0 ? Math.round(v.ats.reduce((a, b) => a + b, 0) / v.ats.length) : 0,
      })).sort((a, b) => b.interviewRate - a.interviewRate).slice(0, 10);

      // ── Interviews per week (last 16 weeks) ───────────────────────────────────
      const interviewWeekMap: Record<string, number> = {};
      for (let w = 15; w >= 0; w--) {
        const d = new Date();
        d.setDate(d.getDate() - w * 7);
        const mon = new Date(d);
        mon.setDate(d.getDate() - d.getDay() + 1);
        const key = mon.toISOString().split("T")[0];
        interviewWeekMap[key] = 0;
      }
      for (const j of interviews) {
        const dateStr = j.interviewDate ?? j.dateApplied;
        if (!dateStr) continue;
        const d = new Date(dateStr);
        const mon = new Date(d);
        mon.setDate(d.getDate() - d.getDay() + 1);
        const key = mon.toISOString().split("T")[0];
        if (key in interviewWeekMap) interviewWeekMap[key]++;
      }
      const interviewsPerWeek = Object.entries(interviewWeekMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, count]) => ({ week, count }));

      // ── Offers per month (last 12 months) ────────────────────────────────────
      const offerMonthMap: Record<string, number> = {};
      for (let m = 11; m >= 0; m--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - m);
        offerMonthMap[d.toISOString().slice(0, 7)] = 0;
      }
      for (const j of allJobs.filter(j => j.status === "Offer")) {
        const dateStr = (j as any).offerDate ?? j.dateApplied;
        if (!dateStr) continue;
        const key = new Date(dateStr).toISOString().slice(0, 7);
        if (key in offerMonthMap) offerMonthMap[key]++;
      }
      const offersPerMonth = Object.entries(offerMonthMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, count]) => ({ month, count }));

      // ── Applications by location (applied jobs) ───────────────────────────────
      const locationMap: Record<string, number> = {};
      for (const j of applied) {
        const loc = j.location ? j.location.split(",")[0].trim() : "Unknown";
        locationMap[loc] = (locationMap[loc] ?? 0) + 1;
      }
      const applicationsByLocation = Object.entries(locationMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([location, count]) => ({ location, count }));

      // ── Avg days applied → offer ──────────────────────────────────────────────
      const appliedToOffer: number[] = [];
      for (const j of allJobs.filter(j => j.status === "Offer")) {
        const offerDate = (j as any).offerDate;
        if (j.dateApplied && offerDate) {
          const days = (new Date(offerDate).getTime() - new Date(j.dateApplied).getTime()) / 86400000;
          if (days >= 0 && days < 365) appliedToOffer.push(days);
        }
      }
      const avgDaysAppliedToOffer = appliedToOffer.length > 0
        ? Math.round(appliedToOffer.reduce((a, b) => a + b, 0) / appliedToOffer.length)
        : null;

      // ── Avg days applied → recruiter contact ────────────────────────────────
      const appliedToRecruiter: number[] = [];
      for (const j of allJobs) {
        const rc = (j as any).recruiterContactDate;
        if (j.dateApplied && rc) {
          const days = (new Date(rc).getTime() - new Date(j.dateApplied).getTime()) / 86400000;
          if (days >= 0 && days < 365) appliedToRecruiter.push(days);
        }
      }
      const avgDaysAppliedToRecruiterContact = appliedToRecruiter.length > 0
        ? Math.round(appliedToRecruiter.reduce((a, b) => a + b, 0) / appliedToRecruiter.length)
        : null;

      // ── Avg total hiring timeline (applied → decision) ───────────────────────
      const appliedToDecision: number[] = [];
      for (const j of allJobs) {
        const dd = (j as any).decisionDate;
        if (j.dateApplied && dd) {
          const days = (new Date(dd).getTime() - new Date(j.dateApplied).getTime()) / 86400000;
          if (days >= 0 && days < 730) appliedToDecision.push(days);
        }
      }
      const avgTotalHiringTimeline = appliedToDecision.length > 0
        ? Math.round(appliedToDecision.reduce((a, b) => a + b, 0) / appliedToDecision.length)
        : null;

      // ── Company Analytics ─────────────────────────────────────────────────────
      const coStatsMap: Record<string, {
        applied: number; interviews: number; offers: number;
        responseDays: number[]; hiringDays: number[];
      }> = {};
      for (const j of applied) {
        const co = (j.company || "Unknown").trim();
        if (!coStatsMap[co]) coStatsMap[co] = { applied: 0, interviews: 0, offers: 0, responseDays: [], hiringDays: [] };
        coStatsMap[co].applied++;
        if (INTERVIEW_STATUSES.has(j.status)) coStatsMap[co].interviews++;
        if (j.status === "Offer") coStatsMap[co].offers++;
        // response time: applied → interview
        const intDate = (j as any).interviewDate;
        if (j.dateApplied && intDate) {
          const d = (new Date(intDate).getTime() - new Date(j.dateApplied).getTime()) / 86400000;
          if (d >= 0 && d < 365) coStatsMap[co].responseDays.push(d);
        }
        // hiring timeline: applied → decisionDate or offerDate
        const endDate = (j as any).decisionDate || (j as any).offerDate;
        if (j.dateApplied && endDate) {
          const d = (new Date(endDate).getTime() - new Date(j.dateApplied).getTime()) / 86400000;
          if (d >= 0 && d < 730) coStatsMap[co].hiringDays.push(d);
        }
      }
      const companyAnalytics = Object.entries(coStatsMap)
        .map(([company, v]) => ({
          company,
          applied: v.applied,
          interviews: v.interviews,
          offers: v.offers,
          interviewRate: v.applied > 0 ? Math.round((v.interviews / v.applied) * 100) : 0,
          offerRate: v.applied > 0 ? Math.round((v.offers / v.applied) * 100) : 0,
          avgResponseDays: v.responseDays.length > 0
            ? Math.round(v.responseDays.reduce((a, b) => a + b, 0) / v.responseDays.length)
            : null,
          avgHiringDays: v.hiringDays.length > 0
            ? Math.round(v.hiringDays.reduce((a, b) => a + b, 0) / v.hiringDays.length)
            : null,
        }))
        .sort((a, b) => b.applied - a.applied);

      // ── Weekly Activity (16-week window, same keys as applicationsPerWeek) ──────
      // Helper: get Monday-anchored ISO week key for any date string
      const toWeekKey = (dateStr: string): string | null => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        const mon = new Date(d);
        mon.setDate(d.getDate() - d.getDay() + 1);
        return mon.toISOString().split("T")[0];
      };

      // Rejections per week
      const rejWeekMap: Record<string, number> = {};
      for (const key of Object.keys(weekMap)) rejWeekMap[key] = 0;
      for (const j of allJobs) {
        if (j.status !== "Rejected" || !j.dateApplied) continue;
        const key = toWeekKey(j.dateApplied);
        if (key && key in rejWeekMap) rejWeekMap[key]++;
      }

      // Networking contacts added per week (by createdAt)
      const netWeekMap: Record<string, number> = {};
      for (const key of Object.keys(weekMap)) netWeekMap[key] = 0;
      for (const c of allContacts) {
        const key = toWeekKey(c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt));
        if (key && key in netWeekMap) netWeekMap[key]++;
      }

      // Follow-ups per week (by lastContactDate)
      const followUpWeekMap: Record<string, number> = {};
      for (const key of Object.keys(weekMap)) followUpWeekMap[key] = 0;
      for (const c of allContacts) {
        if (!c.lastContactDate) continue;
        const key = toWeekKey(c.lastContactDate);
        if (key && key in followUpWeekMap) followUpWeekMap[key]++;
      }

      // Merge all weekly metrics into one combined series (sorted by week)
      const weeklyActivity = applicationsPerWeek.map(({ week, count: applications }, i) => ({
        week,
        applications,
        interviews: interviewsPerWeek[i]?.count ?? 0,
        rejections: rejWeekMap[week] ?? 0,
        networkingContacts: netWeekMap[week] ?? 0,
        followUps: followUpWeekMap[week] ?? 0,
      }));

      // ── Combined weekly trends (apps + interviews on same chart) ──────────────
      const weeklyTrend = applicationsPerWeek.map((w, i) => ({
        week: w.week,
        applications: w.count,
        interviews: interviewsPerWeek[i]?.count ?? 0,
      }));

      // ── Salary Analytics ──────────────────────────────────────────────────────
      const parseSalaryFromText = (text: string): { min: number | null; max: number | null } => {
        if (!text) return { min: null, max: null };
        const pattern = /\$\s*(\d[\d,]*(?:\.\d+)?)\s*[kK]?\s*(?:[-–—to]+\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*[kK]?)?/g;
        const matches: { min: number; max: number }[] = [];
        let m;
        while ((m = pattern.exec(text)) !== null) {
          const parse = (s: string | undefined, hasK: boolean) => {
            if (!s) return null;
            const n = parseFloat(s.replace(/,/g, ""));
            return hasK || n < 1000 ? n * 1000 : n;
          };
          const hasK1 = m[0].toLowerCase().includes("k");
          const val1 = parse(m[1], hasK1);
          const val2 = m[2] ? parse(m[2], hasK1) : null;
          if (val1 && val1 > 20000 && val1 < 1000000) matches.push({ min: val1, max: val2 || val1 });
        }
        if (matches.length === 0) return { min: null, max: null };
        return { min: Math.min(...matches.map(mm => mm.min)), max: Math.max(...matches.map(mm => mm.max)) };
      };

      const salaryByRole: Record<string, number[]> = {};
      const salaryByLocation: Record<string, number[]> = {};
      const salaryByWorkMode: Record<string, number[]> = {};

      for (const job of allJobs) {
        let minVal = job.salaryMin ?? 0;
        let maxVal = job.salaryMax ?? 0;
        if (!minVal && !maxVal && job.description) {
          const parsed = parseSalaryFromText(serverStripHtml(job.description));
          minVal = parsed.min ?? 0;
          maxVal = parsed.max ?? 0;
        }
        if (!minVal && !maxVal) continue;
        const mid = minVal && maxVal ? (minVal + maxVal) / 2 : (minVal || maxVal);
        if (mid < 20000 || mid > 1000000) continue;

        const role = job.roleClassification || "Unknown";
        const loc = job.location ? job.location.split(",")[0].trim() : "Unknown";
        const wm = job.workMode || "Unknown";

        if (!salaryByRole[role]) salaryByRole[role] = [];
        salaryByRole[role].push(mid);
        if (!salaryByLocation[loc]) salaryByLocation[loc] = [];
        salaryByLocation[loc].push(mid);
        if (!salaryByWorkMode[wm]) salaryByWorkMode[wm] = [];
        salaryByWorkMode[wm].push(mid);
      }

      const salarySummaryByRole = Object.entries(salaryByRole)
        .map(([role, vals]) => ({
          role,
          count: vals.length,
          avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
          min: Math.round(Math.min(...vals)),
          max: Math.round(Math.max(...vals)),
        }))
        .filter(r => r.count >= 1)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      const salarySummaryByLocation = Object.entries(salaryByLocation)
        .map(([location, vals]) => ({
          location,
          count: vals.length,
          avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
        }))
        .filter(r => r.count >= 2)
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 10);

      const salarySummaryByWorkMode = Object.entries(salaryByWorkMode)
        .map(([mode, vals]) => ({
          mode,
          count: vals.length,
          avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
          min: Math.round(Math.min(...vals)),
          max: Math.round(Math.max(...vals)),
        }))
        .sort((a, b) => b.avg - a.avg);

      const allSalaryMids = Object.values(salaryByRole).flat();
      const overallAvgSalary = allSalaryMids.length > 0
        ? Math.round(allSalaryMids.reduce((a, b) => a + b, 0) / allSalaryMids.length) : null;

      // ── Salary Distribution (histogram) ──────────────────────────────────────
      const salaryDistBins = [
        { label: "<$40k", min: 0, max: 40000 },
        { label: "$40-60k", min: 40000, max: 60000 },
        { label: "$60-80k", min: 60000, max: 80000 },
        { label: "$80-100k", min: 80000, max: 100000 },
        { label: "$100-120k", min: 100000, max: 120000 },
        { label: "$120-150k", min: 120000, max: 150000 },
        { label: "$150-200k", min: 150000, max: 200000 },
        { label: ">$200k", min: 200000, max: Infinity },
      ];
      const salaryDistribution = salaryDistBins.map(bin => {
        let count = 0;
        for (const j of allJobs) {
          let minVal = j.salaryMin ?? 0;
          let maxVal = j.salaryMax ?? 0;
          if (!minVal && !maxVal && j.description) {
            const parsed = parseSalaryFromText(serverStripHtml(j.description));
            minVal = parsed.min ?? 0;
            maxVal = parsed.max ?? 0;
          }
          if (!minVal && !maxVal) continue;
          const mid = minVal && maxVal ? (minVal + maxVal) / 2 : (minVal || maxVal);
          if (mid >= bin.min && mid < bin.max) count++;
        }
        return { label: bin.label, count };
      });

      // ── Offer salary vs expected range ────────────────────────────────────────
      const offerVsRange = allJobs
        .filter(j => j.status === "Offer" && ((j as any).offerSalary || j.salaryMin || j.salaryMax))
        .map(j => {
          const offerRaw = (j as any).offerSalary ?? "";
          const offered = offerRaw ? parseFloat(offerRaw.replace(/[^0-9.]/g, "")) * (offerRaw.toLowerCase().includes("k") ? 1000 : 1) : null;
          return {
            company: j.company,
            rangeMin: j.salaryMin ?? 0,
            rangeMax: j.salaryMax ?? 0,
            offered: offered && offered > 10000 && offered < 2000000 ? Math.round(offered) : null,
          };
        })
        .filter(d => d.rangeMin || d.rangeMax || d.offered)
        .slice(0, 10);

      res.json({
        totalJobsScraped,
        totalJobsImported,
        totalJobs: allJobs.length,
        totalReviewed,
        totalApplications,
        totalInterviews,
        totalOffers,
        conversionRate,
        avgAtsScoreApplied,
        avgDaysPostedToApplied,
        avgDaysAppliedToInterview,
        avgDaysBetweenApplications,
        applicationsPerWeek,
        applicationsPerDay,
        interviewsPerMonth,
        jobsPerDay,
        applicationsByRoleType,
        atsDistribution,
        atsVsInterviewRate,
        versionInterviewRate,
        bestVersion,
        topCompanies,
        topTitles,
        workModeBreakdown,
        atsImprovements,
        statusFunnel,
        pipelineFunnel,
        jobMarketTopTitles,
        jobMarketTopCompanies,
        jobMarketTopSkills,
        skillsTrend,
        avgMatchScoreByRole,
        totalVersions: allVersions.length,
        avgAtsBefore: allVersions.length > 0 ? Math.round(allVersions.reduce((a, v) => a + v.atsScoreBefore, 0) / allVersions.length) : 0,
        avgAtsAfter: allVersions.length > 0 ? Math.round(allVersions.reduce((a, v) => a + v.atsScoreAfter, 0) / allVersions.length) : 0,
        salarySummaryByRole,
        salarySummaryByLocation,
        salarySummaryByWorkMode,
        overallAvgSalary,
        totalJobsWithSalary: Object.values(salaryByRole).flat().length,
        salaryDistribution,
        offerVsRange,
        sourceAnalytics,
        bestSource,
        versionPerformance,
        interviewsPerWeek,
        offersPerMonth,
        applicationsByLocation,
        avgDaysAppliedToOffer,
        avgDaysAppliedToRecruiterContact,
        avgTotalHiringTimeline,
        companyAnalytics,
        weeklyActivity,
        weeklyTrend,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Resume Version Management ────────────────────────────────────────────────

  // List all resume versions (with optional ?jobId= filter)
  app.get("/api/resume-versions", async (req, res) => {
    try {
      const jobId = req.query.jobId ? parseInt(req.query.jobId as string) : undefined;
      const versions = jobId
        ? await storage.getResumeVersionsByJob(jobId)
        : await storage.getResumeVersions();
      res.json(versions);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Get a single resume version
  app.get("/api/resume-versions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const version = await storage.getResumeVersion(id);
      if (!version) return res.status(404).json({ message: "Version not found" });
      res.json(version);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Manually create a resume version (from parsed plain text)
  app.post("/api/resume-versions", async (req, res) => {
    try {
      const {
        resumeText, jobId, resumeId, company, jobTitle,
        // Or supply sections directly
        candidateName, contact, summary, skills, experience, projects, education, certifications,
      } = req.body;

      let sectionData: any = { candidateName: candidateName ?? "", contact: contact ?? "", summary: summary ?? "", skills: skills ?? "", experience: experience ?? "", projects: projects ?? "", education: education ?? "", certifications: certifications ?? "" };

      // If plain text supplied, parse it into sections
      if (resumeText && !summary) {
        const parsed = parseResumeForExport(resumeText);
        sectionData = {
          candidateName: parsed.name,
          contact: parsed.contact,
          summary: parsed.summary,
          skills: parsed.skills,
          experience: parsed.experience,
          projects: parsed.projects,
          education: parsed.education,
          certifications: parsed.certifications,
        };
      }

      const parsedJobId = jobId ? parseInt(String(jobId)) : undefined;
      const versionLabel = parsedJobId ? await storage.nextVersionLabel(parsedJobId) : `v1`;

      const version = await storage.createResumeVersion({
        jobId: parsedJobId,
        resumeId: resumeId ? parseInt(String(resumeId)) : undefined,
        versionLabel,
        company: company ?? "",
        jobTitle: jobTitle ?? "",
        ...sectionData,
        atsScoreBefore: 0,
        atsScoreAfter: 0,
      });
      res.json(version);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Delete a resume version
  app.delete("/api/resume-versions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.deleteResumeVersion(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Export a saved version to DOCX
  app.post("/api/resume-versions/:id/export-docx", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const version = await storage.getResumeVersion(id);
      if (!version) return res.status(404).json({ message: "Version not found" });

      const sections = {
        name: version.candidateName,
        contact: version.contact,
        summary: version.summary,
        skills: version.skills,
        experience: version.experience,
        projects: version.projects,
        education: version.education,
        certifications: version.certifications,
      };

      let buf: Buffer;
      if (hasCustomTemplate()) {
        buf = fillDocxTemplate(getCustomTemplate(), sections);
      } else {
        buf = await generateResumeDocx(sections);
      }

      const label = version.versionLabel || "resume";
      const safeName = `${version.company || "Resume"}_${version.jobTitle || ""}_${label}`.replace(/[^a-z0-9_\-]/gi, "_");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.docx"`);
      res.send(buf);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Export a saved version to PDF
  app.post("/api/resume-versions/:id/export-pdf", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const version = await storage.getResumeVersion(id);
      if (!version) return res.status(404).json({ message: "Version not found" });

      const sections = {
        name: version.candidateName,
        contact: version.contact,
        summary: version.summary,
        skills: version.skills,
        experience: version.experience,
        projects: version.projects,
        education: version.education,
        certifications: version.certifications,
      };

      const buf = await generateResumePdf(sections);
      const label = version.versionLabel || "resume";
      const safeName = `${version.company || "Resume"}_${version.jobTitle || ""}_${label}`.replace(/[^a-z0-9_\-]/gi, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
      res.send(buf);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Job Notes ───────────────────────────────────────────────────────────────

  app.get("/api/jobs/:id/notes", async (req, res) => {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job id" });
    const notes = await storage.getJobNotes(jobId);
    res.json(notes);
  });

  app.post("/api/jobs/:id/notes", async (req, res) => {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job id" });
    const { noteType = "general", content = "" } = req.body;
    const note = await storage.createJobNote({ jobId, noteType, content });
    res.status(201).json(note);
  });

  app.patch("/api/jobs/:id/notes/:noteId", async (req, res) => {
    const noteId = parseInt(req.params.noteId);
    if (isNaN(noteId)) return res.status(400).json({ message: "Invalid note id" });
    const { content } = req.body;
    if (typeof content !== "string") return res.status(400).json({ message: "content required" });
    const updated = await storage.updateJobNote(noteId, content);
    if (!updated) return res.status(404).json({ message: "Note not found" });
    res.json(updated);
  });

  app.delete("/api/jobs/:id/notes/:noteId", async (req, res) => {
    const noteId = parseInt(req.params.noteId);
    if (isNaN(noteId)) return res.status(400).json({ message: "Invalid note id" });
    await storage.deleteJobNote(noteId);
    res.json({ success: true });
  });

  // ─── Contacts / Networking ────────────────────────────────────────────────────

  app.get("/api/contacts", async (_req, res) => {
    const all = await storage.getContacts();
    res.json(all);
  });

  app.get("/api/contacts/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    const contact = await storage.getContact(id);
    if (!contact) return res.status(404).json({ message: "Not found" });
    res.json(contact);
  });

  app.get("/api/jobs/:id/contacts", async (req, res) => {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) return res.status(400).json({ message: "Invalid job id" });
    const all = await storage.getContactsByJob(jobId);
    res.json(all);
  });

  app.post("/api/contacts", async (req, res) => {
    const parsed = insertContactSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
    const contact = await storage.createContact(parsed.data);
    res.status(201).json(contact);
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    const updated = await storage.updateContact(id, req.body);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  app.delete("/api/contacts/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    await storage.deleteContact(id);
    res.json({ success: true });
  });

  return httpServer;
}
