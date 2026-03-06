import {
  type CandidateProfile, type InsertCandidateProfile,
  type Resume, type InsertResume,
  type Job, type InsertJob,
  type ApplicationAnswer, type InsertApplicationAnswer,
  type ActivityLog, type InsertActivityLog,
  type Settings, type InsertSettings,
  candidateProfile, resumes, jobs, applicationAnswers, activityLog, settings,
  ROLE_TYPES,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, ilike } from "drizzle-orm";

export interface IStorage {
  getProfile(): Promise<CandidateProfile | undefined>;
  upsertProfile(data: InsertCandidateProfile): Promise<CandidateProfile>;

  getResumes(): Promise<Resume[]>;
  getResume(id: number): Promise<Resume | undefined>;
  createResume(data: InsertResume): Promise<Resume>;
  updateResume(id: number, data: Partial<InsertResume>): Promise<Resume | undefined>;
  deleteResume(id: number): Promise<void>;

  getJobs(): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  createJob(data: InsertJob): Promise<Job>;
  updateJob(id: number, data: Partial<InsertJob>): Promise<Job | undefined>;
  deleteJob(id: number): Promise<void>;
  checkDuplicate(title: string, company: string, applyLink: string): Promise<Job | null>;

  getAnswers(): Promise<ApplicationAnswer[]>;
  createAnswer(data: InsertApplicationAnswer): Promise<ApplicationAnswer>;
  updateAnswer(id: number, data: Partial<InsertApplicationAnswer>): Promise<ApplicationAnswer | undefined>;
  deleteAnswer(id: number): Promise<void>;

  getSettings(): Promise<{ roleCategories: string[]; sources: string[]; statuses: string[] }>;
  updateSettings(data: { roleCategories: string[]; sources: string[]; statuses: string[] }): Promise<void>;

  logActivity(data: InsertActivityLog): Promise<ActivityLog>;
}

export class DatabaseStorage implements IStorage {
  async getProfile(): Promise<CandidateProfile | undefined> {
    const rows = await db.select().from(candidateProfile).limit(1);
    return rows[0];
  }

  async upsertProfile(data: InsertCandidateProfile): Promise<CandidateProfile> {
    const existing = await this.getProfile();
    if (existing) {
      const [updated] = await db.update(candidateProfile).set(data).where(eq(candidateProfile.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(candidateProfile).values(data).returning();
    return created;
  }

  async getResumes(): Promise<Resume[]> {
    return db.select().from(resumes).orderBy(desc(resumes.updatedAt));
  }

  async getResume(id: number): Promise<Resume | undefined> {
    const rows = await db.select().from(resumes).where(eq(resumes.id, id));
    return rows[0];
  }

  async createResume(data: InsertResume): Promise<Resume> {
    const [created] = await db.insert(resumes).values(data).returning();
    return created;
  }

  async updateResume(id: number, data: Partial<InsertResume>): Promise<Resume | undefined> {
    const [updated] = await db.update(resumes).set({ ...data, updatedAt: new Date() }).where(eq(resumes.id, id)).returning();
    return updated;
  }

  async deleteResume(id: number): Promise<void> {
    await db.delete(resumes).where(eq(resumes.id, id));
  }

  async getJobs(): Promise<Job[]> {
    return db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }

  async getJob(id: number): Promise<Job | undefined> {
    const rows = await db.select().from(jobs).where(eq(jobs.id, id));
    return rows[0];
  }

  async createJob(data: InsertJob): Promise<Job> {
    const classified = this.classifyAndScore(data);
    const [created] = await db.insert(jobs).values(classified).returning();
    return created;
  }

  async updateJob(id: number, data: Partial<InsertJob>): Promise<Job | undefined> {
    if (data.title !== undefined || data.description !== undefined) {
      const existing = await this.getJob(id);
      if (existing) {
        const merged = { ...existing, ...data };
        const reclassified = this.classifyAndScore(merged as InsertJob);
        data = { ...data, roleClassification: reclassified.roleClassification, fitLabel: reclassified.fitLabel, resumeRecommendation: reclassified.resumeRecommendation };
      }
    }
    const [updated] = await db.update(jobs).set(data).where(eq(jobs.id, id)).returning();
    return updated;
  }

  async deleteJob(id: number): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
  }

  async checkDuplicate(title: string, company: string, applyLink: string): Promise<Job | null> {
    const conditions = [
      and(ilike(jobs.title, title), ilike(jobs.company, company)),
    ];
    if (applyLink) {
      conditions.push(eq(jobs.applyLink, applyLink));
    }
    for (const cond of conditions) {
      const rows = await db.select().from(jobs).where(cond!).limit(1);
      if (rows.length > 0) return rows[0];
    }
    return null;
  }

  async getAnswers(): Promise<ApplicationAnswer[]> {
    return db.select().from(applicationAnswers);
  }

  async createAnswer(data: InsertApplicationAnswer): Promise<ApplicationAnswer> {
    const [created] = await db.insert(applicationAnswers).values(data).returning();
    return created;
  }

  async updateAnswer(id: number, data: Partial<InsertApplicationAnswer>): Promise<ApplicationAnswer | undefined> {
    const [updated] = await db.update(applicationAnswers).set(data).where(eq(applicationAnswers.id, id)).returning();
    return updated;
  }

  async deleteAnswer(id: number): Promise<void> {
    await db.delete(applicationAnswers).where(eq(applicationAnswers.id, id));
  }

  async getSettings(): Promise<{ roleCategories: string[]; sources: string[]; statuses: string[] }> {
    const defaults = {
      roleCategories: ["Data Analyst", "Healthcare Data Analyst", "Healthcare Analyst", "Business Analyst"],
      sources: ["LinkedIn", "Indeed", "Glassdoor", "Company Website", "Referral"],
      statuses: ["New", "Reviewed", "Ready to Apply", "Applied", "Skipped", "Interview", "Rejected"],
    };
    const rows = await db.select().from(settings).where(eq(settings.key, "app_settings"));
    if (rows.length > 0) {
      return rows[0].value as any;
    }
    return defaults;
  }

  async updateSettings(data: { roleCategories: string[]; sources: string[]; statuses: string[] }): Promise<void> {
    const existing = await db.select().from(settings).where(eq(settings.key, "app_settings"));
    if (existing.length > 0) {
      await db.update(settings).set({ value: data }).where(eq(settings.key, "app_settings"));
    } else {
      await db.insert(settings).values({ key: "app_settings", value: data });
    }
  }

  async logActivity(data: InsertActivityLog): Promise<ActivityLog> {
    const [created] = await db.insert(activityLog).values(data).returning();
    return created;
  }

  private classifyAndScore(data: InsertJob): InsertJob {
    const title = (data.title ?? "").toLowerCase();
    const desc = (data.description ?? "").toLowerCase();
    const combined = `${title} ${desc}`;

    let roleClassification = "Unknown";
    if (combined.includes("healthcare") && combined.includes("data analyst")) {
      roleClassification = "Healthcare Data Analyst";
    } else if (combined.includes("healthcare") && combined.includes("analyst")) {
      roleClassification = "Healthcare Analyst";
    } else if (combined.includes("business analyst")) {
      roleClassification = "Business Analyst";
    } else if (combined.includes("data analyst")) {
      roleClassification = "Data Analyst";
    }

    let fitLabel = "Weak Match";
    let score = 0;
    const keywords = ["sql", "python", "excel", "tableau", "power bi", "data", "analytics", "reporting", "dashboard", "etl"];
    keywords.forEach((kw) => {
      if (combined.includes(kw)) score++;
    });
    if (title.includes("analyst")) score += 2;
    if (score >= 5) fitLabel = "Strong Match";
    else if (score >= 2) fitLabel = "Possible Match";

    let resumeRecommendation = "";
    if (roleClassification !== "Unknown") {
      resumeRecommendation = roleClassification;
    }

    return {
      ...data,
      roleClassification,
      fitLabel,
      resumeRecommendation,
    };
  }
}

export const storage = new DatabaseStorage();
