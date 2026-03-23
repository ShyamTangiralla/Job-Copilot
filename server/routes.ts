import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertJobSchema, insertResumeSchema, insertApplicationAnswerSchema, insertCandidateProfileSchema } from "@shared/schema";
import { scrapeJobFromUrl, parseEmailContent, parseBulkInput } from "./scraper";
import { runDiscovery, stopDiscovery, isDiscoveryRunning } from "./discovery";
import { analyzeAndTailor, optimizeResume } from "./tailoring";
import { aiOptimizeResume, generateSuggestions, extractKeywords, generateCoverLetter } from "./ai-optimize";
import { searchLinkedInJobs } from "./linkedin-search";
import { calculateATSBreakdown, calculateATSScore } from "./ats";

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
      const jobText = `${job.title}\n${serverStripHtml(job.description)}`;
      const breakdown = calculateATSBreakdown(activeResume.plainText || "", jobText);
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
      const job = await storage.updateJob(id, req.body);
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
      const { jobDescription, resumeText } = req.body;
      if (!jobDescription || !resumeText) {
        return res.status(400).json({ message: "jobDescription and resumeText are required" });
      }
      if (process.env.OPENAI_API_KEY) {
        try {
          const result = await aiOptimizeResume(resumeText, jobDescription);
          res.json(result);
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
      const { jobDescription, resumeText } = req.body;
      if (!jobDescription || !resumeText) {
        return res.status(400).json({ message: "jobDescription and resumeText are required" });
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

      const content = await generateCoverLetter(resumeText, cleanDesc, job.company, job.title);
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
      const { roles, location, apifyToken } = req.body;

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

      const results = await searchLinkedInJobs(roleList, location || "", apifyToken.trim());

      res.json({
        results,
        count: results.length,
        rolesSearched: roleList,
        location: location || "United States",
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // POST /api/import-linkedin-jobs
  // Accepts an array of LinkedIn job objects, deduplicates, inserts, and runs ATS scoring.
  app.post("/api/import-linkedin-jobs", async (req, res) => {
    try {
      const { jobs } = req.body;

      if (!Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ message: "jobs must be a non-empty array" });
      }

      // Generate a scan batch label for this LinkedIn import run (mirrors discovery.ts pattern)
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
      const importedJobs: { id: number; title: string; company: string }[] = [];
      const duplicateDetails: { title: string; company: string; reason: string }[] = [];
      const failedDetails: { title: string; company: string; error: string }[] = [];

      for (const raw of jobs) {
        const title: string = String(raw.title || "Untitled Position").trim();
        const company: string = String(raw.company || "Unknown Company").trim();
        const applyLink: string = String(raw.applyLink || "").trim();
        const location: string = String(raw.location || "").trim();
        const description: string = String(raw.description || "").trim();
        const datePosted: string = String(raw.datePosted || "").trim();

        try {
          const dupCheck = await storage.checkDuplicate(title, company, applyLink, datePosted || undefined);
          if (dupCheck.isDuplicate) {
            duplicates++;
            duplicateDetails.push({ title, company, reason: dupCheck.reason ?? "duplicate" });
            continue;
          }

          const job = await storage.createJob({
            title,
            company,
            source: "LinkedIn",
            location,
            description,
            applyLink,
            datePosted: datePosted || undefined,
            workMode: location.toLowerCase().includes("remote") ? "Remote" : undefined,
            status: "New",
            importSource: "linkedin-search",
            importedAt: new Date(),
            scanBatchLabel,
            scanDate,
          });

          imported++;
          importedJobs.push({ id: job.id, title: job.title, company: job.company });
        } catch (err: any) {
          failed++;
          failedDetails.push({ title, company, error: err?.message ?? "Unknown error" });
        }
      }

      res.json({
        imported,
        duplicates,
        failed,
        importedJobs,
        duplicateDetails,
        failedDetails,
        scanBatchLabel,
        scanDate,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  return httpServer;
}
