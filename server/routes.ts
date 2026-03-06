import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertJobSchema, insertResumeSchema, insertApplicationAnswerSchema, insertCandidateProfileSchema } from "@shared/schema";

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

  app.delete("/api/resumes/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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

  return httpServer;
}
