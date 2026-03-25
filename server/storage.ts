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
  type TailoredResume, type InsertTailoredResume,
  type CoverLetter, type InsertCoverLetter,
  type ResumeVersion, type InsertResumeVersion,
  type AiCache,
  candidateProfile, resumes, jobs, applicationAnswers, activityLog, settings, importLog,
  discoveryRuns, discoveryResults, tailoredResumes, coverLetters, resumeVersions, aiUsageLog, aiCache,
  ROLE_TYPES,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, ilike, sql } from "drizzle-orm";
import { calculateATSScore } from "./ats";

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

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    // Only strip params that are DEFINITIVELY ad/campaign tracking and never used as job identifiers.
    // Params like ref, refId, source, trackingId are intentionally kept because many career sites
    // use them as actual job or application identifiers (e.g. ?source=greenhouse&refId=12345).
    const pureTrackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "fbclid", "gclid",
      "mc_cid", "mc_eid",
      "trk", "trkCampaign", "trkInfo",  // LinkedIn nav tracking; job ID is always in the path
    ];
    for (const param of pureTrackingParams) {
      parsed.searchParams.delete(param);
    }
    // Sort remaining params so order differences don't create false non-matches
    const sorted = new URLSearchParams([...parsed.searchParams.entries()].sort());
    let pathname = parsed.pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/";
    const search = sorted.toString() ? `?${sorted.toString()}` : "";
    return `${parsed.hostname.toLowerCase()}${pathname}${search}`.toLowerCase();
  } catch {
    return url.toLowerCase().trim().replace(/\/+$/, "");
  }
}

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
  checkDuplicate(title: string, company: string, applyLink: string, datePosted?: string, dedupeKey?: string): Promise<{ isDuplicate: boolean; existingJob?: Job; reason?: string }>;

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
  getScoringWeights(): Promise<{ roleMatch: number; freshness: number; experienceLevel: number; keywordMatch: number; location: number; sourceQuality: number; resumeMatch: number }>;
  updateScoringWeights(data: any): Promise<void>;
  createDiscoveryRun(data: InsertDiscoveryRun): Promise<DiscoveryRun>;
  updateDiscoveryRun(id: number, data: Partial<InsertDiscoveryRun>): Promise<DiscoveryRun | undefined>;
  getDiscoveryRuns(): Promise<DiscoveryRun[]>;
  getDiscoveryRun(id: number): Promise<DiscoveryRun | undefined>;
  createDiscoveryResult(data: InsertDiscoveryResult): Promise<DiscoveryResult>;
  getDiscoveryResults(runId: number): Promise<DiscoveryResult[]>;
  getRecentDiscoveryResults(): Promise<DiscoveryResult[]>;
  recalculateAllPriorityScores(): Promise<number>;

  createTailoredResume(data: InsertTailoredResume): Promise<TailoredResume>;
  getTailoredResumes(jobId: number): Promise<TailoredResume[]>;
  getTailoredResume(id: number): Promise<TailoredResume | undefined>;
  deleteTailoredResume(id: number): Promise<void>;

  getCoverLetter(jobId: number): Promise<CoverLetter | undefined>;
  upsertCoverLetter(data: InsertCoverLetter): Promise<CoverLetter>;
  deleteCoverLetter(jobId: number): Promise<void>;

  logAiUsage(feature: string, jobId?: number, resumeId?: number): Promise<void>;
  getAiUsageCount(feature: string, jobId: number): Promise<number>;
  getAiUsageStats(): Promise<{ total: number; byFeature: Record<string, number> }>;
  getAiCache(feature: string, jobId: number, resumeId?: number): Promise<AiCache | undefined>;
  setAiCache(feature: string, jobId: number, result: any, resumeId?: number): Promise<void>;
  clearAiCache(feature: string, jobId: number): Promise<void>;

  createResumeVersion(data: InsertResumeVersion): Promise<ResumeVersion>;
  getResumeVersions(): Promise<ResumeVersion[]>;
  getResumeVersion(id: number): Promise<ResumeVersion | undefined>;
  getResumeVersionsByJob(jobId: number): Promise<ResumeVersion[]>;
  deleteResumeVersion(id: number): Promise<void>;
  nextVersionLabel(jobId: number): Promise<string>;
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
    const weights = await this.getScoringWeights();
    const { matchScoreNumeric: _, ...classified } = this.classifyAndScore(data, weights);

    let atsScore = 0;
    const jobText = [data.title, data.description ? serverStripHtml(data.description) : ""].filter(Boolean).join("\n").trim();
    if (jobText) {
      try {
        const [activeResume] = await db
          .select()
          .from(resumes)
          .where(eq(resumes.active, true))
          .orderBy(desc(resumes.updatedAt))
          .limit(1);
        if (activeResume?.plainText) {
          atsScore = calculateATSScore(activeResume.plainText, jobText);
        }
      } catch {
        atsScore = 0;
      }
    }

    const [created] = await db.insert(jobs).values({ ...classified, atsScore }).returning();
    return created;
  }

  async updateJob(id: number, data: Partial<InsertJob>): Promise<Job | undefined> {
    if (data.title !== undefined || data.description !== undefined) {
      const existing = await this.getJob(id);
      if (existing) {
        const weights = await this.getScoringWeights();
        const merged = { ...existing, ...data };
        const { matchScoreNumeric: _, ...reclassified } = this.classifyAndScore(merged as InsertJob, weights);
        data = {
          ...data,
          roleClassification: reclassified.roleClassification,
          fitLabel: reclassified.fitLabel,
          resumeRecommendation: reclassified.resumeRecommendation,
          applyPriorityScore: reclassified.applyPriorityScore,
          applyPriorityLabel: reclassified.applyPriorityLabel,
          applyPriorityExplanation: reclassified.applyPriorityExplanation,
        };
      }
    }
    const [updated] = await db.update(jobs).set(data).where(eq(jobs.id, id)).returning();
    return updated;
  }

  async recalculateAllPriorityScores(): Promise<number> {
    const weights = await this.getScoringWeights();
    const allJobs = await this.getJobs();
    let updated = 0;
    for (const job of allJobs) {
      const { matchScoreNumeric: _, ...reclassified } = this.classifyAndScore(job as InsertJob, weights);
      await db.update(jobs).set({
        applyPriorityScore: reclassified.applyPriorityScore,
        applyPriorityLabel: reclassified.applyPriorityLabel,
        applyPriorityExplanation: reclassified.applyPriorityExplanation,
        roleClassification: reclassified.roleClassification,
        fitLabel: reclassified.fitLabel,
        resumeRecommendation: reclassified.resumeRecommendation,
      }).where(eq(jobs.id, job.id));
      updated++;
    }
    return updated;
  }

  async deleteJob(id: number): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
  }

  async checkDuplicate(title: string, company: string, applyLink: string, datePosted?: string, dedupeKey?: string): Promise<{ isDuplicate: boolean; existingJob?: Job; reason?: string }> {
    // ── Rule 1: dedupeKey match (LinkedIn job ID or URL fingerprint) ──────
    // This is the most reliable cross-run check. LinkedIn job IDs never change.
    if (dedupeKey) {
      const rows = await db.select().from(jobs)
        .where(and(
          sql`${jobs.dedupeKey} != ''`,
          sql`${jobs.dedupeKey} = ${dedupeKey}`,
        ))
        .limit(1);
      if (rows.length > 0) {
        return { isDuplicate: true, existingJob: rows[0], reason: "dedupe_key_match" };
      }
    }

    // ── Rule 2: URL-based matching ────────────────────────────────────────
    // A job with an apply link is ONLY a duplicate if the normalized URL matches.
    // title+company alone is never enough when a URL is present.
    if (applyLink) {
      const rawLink = applyLink.toLowerCase().trim().replace(/\/+$/, "");
      const normalizedLink = normalizeUrl(applyLink);

      const existingWithLinks = await db.select().from(jobs).where(sql`${jobs.applyLink} != ''`);

      for (const j of existingWithLinks) {
        const existingRaw = j.applyLink.toLowerCase().trim().replace(/\/+$/, "");
        if (existingRaw === rawLink) {
          return { isDuplicate: true, existingJob: j, reason: "exact_url_match" };
        }
      }

      for (const j of existingWithLinks) {
        const existingNormalized = normalizeUrl(j.applyLink);
        if (existingNormalized === normalizedLink) {
          return { isDuplicate: true, existingJob: j, reason: "normalized_url_match" };
        }
      }

      // URL present and no match found → not a duplicate
      return { isDuplicate: false };
    }

    // ── Rule 3: Title + company + date fingerprint ────────────────────────
    // Only used when no URL is available. Require all three to avoid false positives.
    if (title && company && datePosted) {
      const normalizedTitle = title.toLowerCase().trim();
      const normalizedCompany = company.toLowerCase().trim();
      const rows = await db.select().from(jobs)
        .where(and(
          sql`lower(trim(${jobs.title})) = ${normalizedTitle}`,
          sql`lower(trim(${jobs.company})) = ${normalizedCompany}`,
          sql`${jobs.datePosted} = ${datePosted}`,
        ))
        .limit(1);
      if (rows.length > 0) {
        return { isDuplicate: true, existingJob: rows[0], reason: "same_company_title_same_day" };
      }
    }

    return { isDuplicate: false };
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
        primaryRoles: [
          "Data Analyst", "Junior Data Analyst", "Entry Level Data Analyst",
          "Business Analyst", "Business Data Analyst", "Business Intelligence Analyst",
          "BI Analyst", "Reporting Analyst", "Analytics Analyst", "Product Analyst",
          "Operations Analyst", "Financial Analyst", "Healthcare Data Analyst",
          "Clinical Data Analyst", "Marketing Analyst", "Customer Insights Analyst",
          "Data Quality Analyst", "Data Operations Analyst", "Analytics Associate", "SQL Analyst",
        ],
        secondaryRoles: ["Data Engineer", "Data Scientist"],
        preferredLocations: ["United States", "New York", "Remote"],
        workModes: ["Remote", "Hybrid", "Onsite"],
        maxJobsPerScan: 300,
        searchKeywords: ["SQL", "Python", "Tableau", "Power BI", "healthcare analytics", "Excel", "dashboards"],
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
        preferredFreshness: "Last 72 hours preferred, fallback to 7 days",
        dailyImportCap: 300,
      };
    }
    const val = rows[0].value as any;
    if (!val.preferredFreshness) val.preferredFreshness = "Last 24 hours preferred, fallback to 48 hours";
    if (!val.dailyImportCap) val.dailyImportCap = 150;
    return val;
  }

  async getScoringWeights(): Promise<{
    roleMatch: number; freshness: number; experienceLevel: number;
    keywordMatch: number; location: number; sourceQuality: number; resumeMatch: number;
  }> {
    const rows = await db.select().from(settings).where(eq(settings.key, "scoringWeights"));
    if (rows.length === 0) {
      return { roleMatch: 25, freshness: 20, experienceLevel: 15, keywordMatch: 15, location: 15, sourceQuality: 5, resumeMatch: 5 };
    }
    return rows[0].value as any;
  }

  async updateScoringWeights(data: any): Promise<void> {
    const existing = await db.select().from(settings).where(eq(settings.key, "scoringWeights"));
    if (existing.length === 0) {
      await db.insert(settings).values({ key: "scoringWeights", value: data });
    } else {
      await db.update(settings).set({ value: data }).where(eq(settings.key, "scoringWeights"));
    }
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

  async createTailoredResume(data: InsertTailoredResume): Promise<TailoredResume> {
    const [created] = await db.insert(tailoredResumes).values(data).returning();
    return created;
  }

  async getTailoredResumes(jobId: number): Promise<TailoredResume[]> {
    return db.select().from(tailoredResumes).where(eq(tailoredResumes.jobId, jobId)).orderBy(desc(tailoredResumes.createdAt));
  }

  async getTailoredResume(id: number): Promise<TailoredResume | undefined> {
    const rows = await db.select().from(tailoredResumes).where(eq(tailoredResumes.id, id));
    return rows[0];
  }

  async deleteTailoredResume(id: number): Promise<void> {
    await db.delete(tailoredResumes).where(eq(tailoredResumes.id, id));
  }

  classifyAndScore(data: InsertJob, weights?: { roleMatch: number; freshness: number; experienceLevel: number; keywordMatch: number; location: number; sourceQuality: number; resumeMatch: number }): InsertJob & { matchScoreNumeric: number } {
    const w = weights ?? { roleMatch: 25, freshness: 20, experienceLevel: 15, keywordMatch: 15, location: 15, sourceQuality: 5, resumeMatch: 5 };
    const title = (data.title ?? "").toLowerCase();
    const desc = (data.description ?? "").toLowerCase();
    const combined = `${title} ${desc}`;
    const source = (data.source ?? "").toLowerCase();
    const location = (data.location ?? "").toLowerCase();
    const workMode = (data.workMode ?? "").toLowerCase();
    const freshnessLabel = data.freshnessLabel ?? "";

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

    const priority = this.computeApplyPriorityScore({
      title, desc: combined, source, location, workMode, freshnessLabel, roleClassification, resumeRecommendation,
    }, w);

    return {
      ...data,
      roleClassification,
      fitLabel,
      resumeRecommendation,
      applyPriorityScore: priority.applyPriorityScore,
      applyPriorityLabel: priority.applyPriorityLabel,
      applyPriorityExplanation: priority.applyPriorityExplanation,
      matchScoreNumeric: score,
    };
  }

  computeApplyPriorityScore(input: {
    title: string; desc: string; source: string; location: string;
    workMode: string; freshnessLabel: string; roleClassification: string;
    resumeRecommendation: string;
  }, weights?: { roleMatch: number; freshness: number; experienceLevel: number; keywordMatch: number; location: number; sourceQuality: number; resumeMatch: number }): { applyPriorityScore: number; applyPriorityLabel: string; applyPriorityExplanation: string } {
    const w = weights ?? { roleMatch: 25, freshness: 20, experienceLevel: 15, keywordMatch: 15, location: 15, sourceQuality: 5, resumeMatch: 5 };
    const { title, desc, source, location, workMode, freshnessLabel, roleClassification, resumeRecommendation } = input;
    const explanations: string[] = [];
    let totalScore = 0;

    const primaryRoles = ["data analyst", "healthcare data analyst", "business analyst", "financial analyst", "bi analyst"];
    const secondaryRoles = ["data engineer", "data scientist"];
    if (primaryRoles.some(r => title.includes(r))) {
      totalScore += w.roleMatch;
      explanations.push("Strong role match");
    } else if (secondaryRoles.some(r => title.includes(r))) {
      totalScore += Math.round(w.roleMatch * 0.48);
      explanations.push("Secondary role match");
    }

    const seniorTerms = ["senior", "principal", "director", "staff", "lead", "manager"];
    const juniorTerms = ["analyst", "associate", "junior", "entry"];
    const isSenior = seniorTerms.some(t => title.includes(t));
    const isJunior = juniorTerms.some(t => title.includes(t));
    if (isJunior && !isSenior) {
      totalScore += w.experienceLevel;
      explanations.push("Entry/mid level");
    } else if (!isSenior && !isJunior) {
      totalScore += Math.round(w.experienceLevel * 0.53);
    } else {
      explanations.push("Senior level (reduced)");
    }

    if (freshnessLabel === "Fresh 24h") {
      totalScore += w.freshness;
      explanations.push("Fresh 24h");
    } else if (freshnessLabel === "Fresh 48h") {
      totalScore += Math.round(w.freshness * 0.8);
      explanations.push("Fresh 48h");
    } else if (freshnessLabel === "Fresh 72h") {
      totalScore += Math.round(w.freshness * 0.6);
      explanations.push("Fresh 72h");
    } else if (freshnessLabel === "Fresh 7d") {
      totalScore += Math.round(w.freshness * 0.35);
      explanations.push("Fresh 7d");
    } else {
      totalScore += Math.round(w.freshness * 0.15);
    }

    const wm = workMode.toLowerCase();
    if (wm === "remote") {
      totalScore += Math.round(w.location * 0.67);
      explanations.push("Remote");
    } else if (wm === "hybrid") {
      totalScore += Math.round(w.location * 0.53);
      explanations.push("Hybrid");
    }
    const preferredLocs = ["united states", "new york"];
    if (preferredLocs.some(loc => location.includes(loc))) {
      totalScore += Math.round(w.location * 0.33);
      explanations.push("Preferred location");
    }

    const kwList = ["sql", "python", "tableau", "power bi", "excel", "dashboards", "reporting", "analytics", "healthcare analytics", "business intelligence", "etl", "data visualization"];
    const matchedKw: string[] = [];
    kwList.forEach(kw => {
      if (desc.includes(kw)) matchedKw.push(kw.toUpperCase());
    });
    const kwScore = Math.min(w.keywordMatch, Math.round(matchedKw.length * (w.keywordMatch / 12)));
    totalScore += kwScore;
    if (matchedKw.length > 0) {
      explanations.push(`${matchedKw.slice(0, 4).join("/")} keywords matched`);
    }

    if (resumeRecommendation && resumeRecommendation !== "" && roleClassification !== "Unknown") {
      totalScore += w.resumeMatch;
      explanations.push("Resume available");
    }

    const preferredSources = ["greenhouse", "lever", "workday", "company career"];
    if (preferredSources.some(s => source.includes(s))) {
      totalScore += w.sourceQuality;
      explanations.push("Quality source");
    } else {
      totalScore += Math.round(w.sourceQuality * 0.2);
    }

    const clamped = Math.max(0, Math.min(100, totalScore));

    let label: string;
    if (clamped >= 85) label = "Apply Immediately";
    else if (clamped >= 70) label = "High Priority";
    else if (clamped >= 55) label = "Medium Priority";
    else label = "Low Priority";

    return {
      applyPriorityScore: clamped,
      applyPriorityLabel: label,
      applyPriorityExplanation: explanations.join(", "),
    };
  }

  async getCoverLetter(jobId: number): Promise<CoverLetter | undefined> {
    const rows = await db.select().from(coverLetters).where(eq(coverLetters.jobId, jobId)).limit(1);
    return rows[0];
  }

  async upsertCoverLetter(data: InsertCoverLetter): Promise<CoverLetter> {
    const existing = await this.getCoverLetter(data.jobId);
    if (existing) {
      const [updated] = await db
        .update(coverLetters)
        .set({ content: data.content, resumeId: data.resumeId, updatedAt: new Date() })
        .where(eq(coverLetters.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(coverLetters).values(data).returning();
    return created;
  }

  async deleteCoverLetter(jobId: number): Promise<void> {
    await db.delete(coverLetters).where(eq(coverLetters.jobId, jobId));
  }

  async logAiUsage(feature: string, jobId?: number, resumeId?: number): Promise<void> {
    await db.insert(aiUsageLog).values({ feature, jobId, resumeId });
  }

  async getAiUsageCount(feature: string, jobId: number): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(aiUsageLog)
      .where(and(eq(aiUsageLog.feature, feature), eq(aiUsageLog.jobId, jobId)));
    return rows[0]?.count ?? 0;
  }

  async getAiUsageStats(): Promise<{ total: number; byFeature: Record<string, number> }> {
    const rows = await db
      .select({ feature: aiUsageLog.feature, count: sql<number>`cast(count(*) as int)` })
      .from(aiUsageLog)
      .groupBy(aiUsageLog.feature);
    const byFeature: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byFeature[row.feature] = row.count;
      total += row.count;
    }
    return { total, byFeature };
  }

  async getAiCache(feature: string, jobId: number, resumeId?: number): Promise<AiCache | undefined> {
    const conditions = resumeId != null
      ? and(eq(aiCache.feature, feature), eq(aiCache.jobId, jobId), eq(aiCache.resumeId, resumeId))
      : and(eq(aiCache.feature, feature), eq(aiCache.jobId, jobId));
    const rows = await db.select().from(aiCache).where(conditions).orderBy(desc(aiCache.createdAt)).limit(1);
    return rows[0];
  }

  async setAiCache(feature: string, jobId: number, result: any, resumeId?: number): Promise<void> {
    const conditions = resumeId != null
      ? and(eq(aiCache.feature, feature), eq(aiCache.jobId, jobId), eq(aiCache.resumeId, resumeId))
      : and(eq(aiCache.feature, feature), eq(aiCache.jobId, jobId));
    const existing = await db.select({ id: aiCache.id }).from(aiCache).where(conditions).limit(1);
    if (existing.length > 0) {
      await db.update(aiCache).set({ result, createdAt: new Date() }).where(eq(aiCache.id, existing[0].id));
    } else {
      await db.insert(aiCache).values({ feature, jobId, resumeId, result });
    }
  }

  async clearAiCache(feature: string, jobId: number): Promise<void> {
    await db.delete(aiCache).where(and(eq(aiCache.feature, feature), eq(aiCache.jobId, jobId)));
  }

  // ─── Resume Versions ────────────────────────────────────────────────────────

  async createResumeVersion(data: InsertResumeVersion): Promise<ResumeVersion> {
    const [created] = await db.insert(resumeVersions).values(data).returning();
    return created;
  }

  async getResumeVersions(): Promise<ResumeVersion[]> {
    return db.select().from(resumeVersions).orderBy(desc(resumeVersions.createdAt));
  }

  async getResumeVersion(id: number): Promise<ResumeVersion | undefined> {
    const rows = await db.select().from(resumeVersions).where(eq(resumeVersions.id, id));
    return rows[0];
  }

  async getResumeVersionsByJob(jobId: number): Promise<ResumeVersion[]> {
    return db.select().from(resumeVersions)
      .where(eq(resumeVersions.jobId, jobId))
      .orderBy(desc(resumeVersions.createdAt));
  }

  async deleteResumeVersion(id: number): Promise<void> {
    await db.delete(resumeVersions).where(eq(resumeVersions.id, id));
  }

  async nextVersionLabel(jobId: number): Promise<string> {
    const existing = await db.select({ id: resumeVersions.id })
      .from(resumeVersions)
      .where(eq(resumeVersions.jobId, jobId));
    return `v${existing.length + 1}`;
  }
}

export const storage = new DatabaseStorage();
