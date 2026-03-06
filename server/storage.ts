import {
  type CandidateProfile, type InsertCandidateProfile,
  type Resume, type InsertResume,
  type Job, type InsertJob,
  type ApplicationAnswer, type InsertApplicationAnswer,
  type ActivityLog, type InsertActivityLog,
  type Settings, type InsertSettings,
  type ImportLog, type InsertImportLog,
  type DiscoveryRun, type InsertDiscoveryRun,
  type DiscoveryResult, type InsertDiscoveryResult,
  candidateProfile, resumes, jobs, applicationAnswers, activityLog, settings, importLog,
  discoveryRuns, discoveryResults,
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

  createImportLog(data: InsertImportLog): Promise<ImportLog>;
  getImportLogs(): Promise<ImportLog[]>;

  getDiscoverySettings(): Promise<any>;
  updateDiscoverySettings(data: any): Promise<void>;
  createDiscoveryRun(data: InsertDiscoveryRun): Promise<DiscoveryRun>;
  updateDiscoveryRun(id: number, data: Partial<InsertDiscoveryRun>): Promise<DiscoveryRun | undefined>;
  getDiscoveryRuns(): Promise<DiscoveryRun[]>;
  getDiscoveryRun(id: number): Promise<DiscoveryRun | undefined>;
  createDiscoveryResult(data: InsertDiscoveryResult): Promise<DiscoveryResult>;
  getDiscoveryResults(runId: number): Promise<DiscoveryResult[]>;
  getRecentDiscoveryResults(): Promise<DiscoveryResult[]>;
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
    const { matchScoreNumeric: _, ...classified } = this.classifyAndScore(data);
    const [created] = await db.insert(jobs).values(classified).returning();
    return created;
  }

  async updateJob(id: number, data: Partial<InsertJob>): Promise<Job | undefined> {
    if (data.title !== undefined || data.description !== undefined) {
      const existing = await this.getJob(id);
      if (existing) {
        const merged = { ...existing, ...data };
        const { matchScoreNumeric: _, ...reclassified } = this.classifyAndScore(merged as InsertJob);
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

  async createImportLog(data: InsertImportLog): Promise<ImportLog> {
    const [created] = await db.insert(importLog).values(data).returning();
    return created;
  }

  async getImportLogs(): Promise<ImportLog[]> {
    return db.select().from(importLog).orderBy(desc(importLog.createdAt)).limit(100);
  }

  async getDiscoverySettings(): Promise<any> {
    const rows = await db.select().from(settings).where(eq(settings.key, "discovery"));
    if (rows.length === 0) {
      return {
        primaryRoles: ["Data Analyst", "Healthcare Data Analyst", "Business Analyst", "Financial Analyst", "BI Analyst"],
        secondaryRoles: ["Data Engineer", "Data Scientist"],
        preferredLocations: ["United States", "New York", "Remote"],
        workModes: ["Remote", "Hybrid", "Onsite"],
        maxJobsPerScan: 50,
        searchKeywords: ["SQL", "Python", "Tableau", "Power BI", "healthcare analytics"],
        excludeKeywords: [],
        jobAgeFilter: "Last 7 days",
        sources: {
          googleJobs: true,
          greenhouse: true,
          lever: true,
          workday: false,
          companyCareerPages: false,
          emailAlerts: false,
        },
        scheduler: "Manual Only",
        preferredFreshness: "Last 24 hours preferred, fallback to 48 hours",
        dailyImportCap: 150,
      };
    }
    const val = rows[0].value as any;
    if (!val.preferredFreshness) val.preferredFreshness = "Last 24 hours preferred, fallback to 48 hours";
    if (!val.dailyImportCap) val.dailyImportCap = 150;
    return val;
  }

  async updateDiscoverySettings(data: any): Promise<void> {
    const existing = await db.select().from(settings).where(eq(settings.key, "discovery"));
    if (existing.length === 0) {
      await db.insert(settings).values({ key: "discovery", value: data });
    } else {
      await db.update(settings).set({ value: data }).where(eq(settings.key, "discovery"));
    }
  }

  async createDiscoveryRun(data: InsertDiscoveryRun): Promise<DiscoveryRun> {
    const [created] = await db.insert(discoveryRuns).values(data).returning();
    return created;
  }

  async updateDiscoveryRun(id: number, data: Partial<InsertDiscoveryRun>): Promise<DiscoveryRun | undefined> {
    const [updated] = await db.update(discoveryRuns).set(data).where(eq(discoveryRuns.id, id)).returning();
    return updated;
  }

  async getDiscoveryRuns(): Promise<DiscoveryRun[]> {
    return db.select().from(discoveryRuns).orderBy(desc(discoveryRuns.startedAt)).limit(20);
  }

  async getDiscoveryRun(id: number): Promise<DiscoveryRun | undefined> {
    const rows = await db.select().from(discoveryRuns).where(eq(discoveryRuns.id, id));
    return rows[0];
  }

  async createDiscoveryResult(data: InsertDiscoveryResult): Promise<DiscoveryResult> {
    const [created] = await db.insert(discoveryResults).values(data).returning();
    return created;
  }

  async getDiscoveryResults(runId: number): Promise<DiscoveryResult[]> {
    return db.select().from(discoveryResults).where(eq(discoveryResults.runId, runId)).orderBy(desc(discoveryResults.createdAt));
  }

  async getRecentDiscoveryResults(): Promise<DiscoveryResult[]> {
    return db.select().from(discoveryResults).orderBy(desc(discoveryResults.createdAt)).limit(50);
  }

  classifyAndScore(data: InsertJob): InsertJob & { matchScoreNumeric: number } {
    const title = (data.title ?? "").toLowerCase();
    const desc = (data.description ?? "").toLowerCase();
    const combined = `${title} ${desc}`;
    const source = (data.source ?? "").toLowerCase();
    const location = (data.location ?? "").toLowerCase();

    let roleClassification = "Unknown";
    if (combined.includes("healthcare") && combined.includes("data analyst")) {
      roleClassification = "Healthcare Data Analyst";
    } else if (combined.includes("healthcare") && combined.includes("analyst")) {
      roleClassification = "Healthcare Analyst";
    } else if (combined.includes("business analyst")) {
      roleClassification = "Business Analyst";
    } else if (combined.includes("financial analyst")) {
      roleClassification = "Financial Analyst";
    } else if (combined.includes("bi analyst") || combined.includes("business intelligence analyst")) {
      roleClassification = "BI Analyst";
    } else if (combined.includes("data analyst")) {
      roleClassification = "Data Analyst";
    }

    let score = 0;

    const primaryRoles = ["data analyst", "healthcare data analyst", "business analyst", "financial analyst", "bi analyst"];
    const secondaryRoles = ["data engineer", "data scientist"];
    if (primaryRoles.some(r => title.includes(r))) score += 30;
    else if (secondaryRoles.some(r => title.includes(r))) score += 15;
    else score += 0;

    const seniorTerms = ["senior", "principal", "director", "staff", "lead", "manager"];
    const juniorTerms = ["analyst", "associate", "junior", "entry"];
    if (seniorTerms.some(t => title.includes(t))) score -= 10;
    if (juniorTerms.some(t => title.includes(t))) score += 10;

    const keywords = ["sql", "python", "tableau", "power bi", "healthcare analytics", "dashboards", "etl", "data visualization"];
    keywords.forEach(kw => {
      if (combined.includes(kw)) score += 5;
    });

    const preferredLocations = ["remote", "united states", "new york"];
    if (preferredLocations.some(loc => location.includes(loc) || combined.includes(loc))) score += 10;

    const preferredSources = ["greenhouse", "lever", "workday", "company career"];
    if (preferredSources.some(s => source.includes(s))) score += 5;

    let fitLabel: string;
    if (score >= 40) fitLabel = "Strong Match";
    else if (score >= 20) fitLabel = "Possible Match";
    else fitLabel = "Weak Match";

    let resumeRecommendation = "";
    if (roleClassification !== "Unknown") {
      resumeRecommendation = roleClassification;
    }

    return {
      ...data,
      roleClassification,
      fitLabel,
      resumeRecommendation,
      matchScoreNumeric: score,
    };
  }
}

export const storage = new DatabaseStorage();
