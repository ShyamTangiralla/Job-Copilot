import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertJobSchema, insertResumeSchema, insertApplicationAnswerSchema, insertCandidateProfileSchema } from "@shared/schema";
import { scrapeJobFromUrl, parseEmailContent, parseBulkInput } from "./scraper";

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

  app.post("/api/jobs/check-duplicate", async (req, res) => {
    try {
      const { title, company, applyLink } = req.body;
      const duplicate = await storage.checkDuplicate(title || "", company || "", applyLink || "");
      res.json({ isDuplicate: !!duplicate, existingJob: duplicate });
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

  async function checkDuplicate(title: string, company: string, applyLink: string): Promise<boolean> {
    const allJobs = await storage.getJobs();
    return allJobs.some((j) => {
      const titleMatch = j.title.toLowerCase().trim() === title.toLowerCase().trim();
      const companyMatch = j.company.toLowerCase().trim() === company.toLowerCase().trim();
      const linkMatch = applyLink && j.applyLink && j.applyLink.toLowerCase().trim() === applyLink.toLowerCase().trim();
      return (titleMatch && companyMatch) || (applyLink && linkMatch);
    });
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

      const isDuplicate = await checkDuplicate(scraped.title, scraped.company, scraped.applyLink);
      if (isDuplicate) {
        await storage.createImportLog({
          sourceType: "url",
          sourceUrl: url,
          status: "duplicate",
          jobTitle: scraped.title,
          jobCompany: scraped.company,
        });
        return res.status(409).json({ message: "This job already exists in your inbox", duplicate: true });
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

          const isDuplicate = await checkDuplicate(title, company, parsed_job.applyLink);
          if (isDuplicate) {
            await storage.createImportLog({
              sourceType: "email",
              status: "duplicate",
              jobTitle: title,
              jobCompany: company,
            });
            results.push({ title, company, status: "duplicate" });
            continue;
          }

          const job = await storage.createJob({
            title,
            company,
            source: parsed_job.source || "Email Alert",
            location: parsed_job.location || "",
            applyLink: parsed_job.applyLink || "",
            status: "New",
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

          const isDuplicate = await checkDuplicate(title, company, applyLink);
          if (isDuplicate) {
            await storage.createImportLog({
              sourceType: "bulk",
              status: "duplicate",
              jobTitle: title,
              jobCompany: company,
            });
            results.push({ title, company, status: "duplicate" });
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

  app.get("/api/intake/history", async (_req, res) => {
    try {
      const logs = await storage.getImportLogs();
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  return httpServer;
}
