import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const candidateProfile = pgTable("candidate_profile", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  fullName: text("full_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  location: text("location").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  portfolioUrl: text("portfolio_url").notNull().default(""),
  workAuthorization: text("work_authorization").notNull().default(""),
  sponsorshipRequired: boolean("sponsorship_required").notNull().default(false),
  salaryPreference: text("salary_preference").notNull().default(""),
  willingToRelocate: boolean("willing_to_relocate").notNull().default(false),
  preferredLocations: text("preferred_locations").notNull().default(""),
  preferredJobTypes: text("preferred_job_types").array().notNull().default(sql`ARRAY[]::text[]`),
  yearsOfExperience: text("years_of_experience").notNull().default(""),
});

export const insertCandidateProfileSchema = createInsertSchema(candidateProfile).omit({ id: true });
export type InsertCandidateProfile = z.infer<typeof insertCandidateProfileSchema>;
export type CandidateProfile = typeof candidateProfile.$inferSelect;

export const resumes = pgTable("resumes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  roleType: text("role_type").notNull(),
  plainText: text("plain_text").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  filePath: text("file_path").notNull().default(""),
  fileType: text("file_type").notNull().default(""),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertResumeSchema = createInsertSchema(resumes).omit({ id: true, updatedAt: true });
export type InsertResume = z.infer<typeof insertResumeSchema>;
export type Resume = typeof resumes.$inferSelect;

export const jobs = pgTable("jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  source: text("source").notNull().default(""),
  location: text("location").notNull().default(""),
  workMode: text("work_mode").notNull().default("Remote"),
  datePosted: text("date_posted").notNull().default(""),
  description: text("description").notNull().default(""),
  applyLink: text("apply_link").notNull().default(""),
  roleClassification: text("role_classification").notNull().default("Unknown"),
  resumeRecommendation: text("resume_recommendation").notNull().default(""),
  fitLabel: text("fit_label").notNull().default(""),
  freshnessLabel: text("freshness_label").notNull().default(""),
  status: text("status").notNull().default("New"),
  priority: text("priority").notNull().default("Medium"),
  notes: text("notes").notNull().default(""),
  followUpDate: text("follow_up_date").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

export const applicationAnswers = pgTable("application_answers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
});

export const insertApplicationAnswerSchema = createInsertSchema(applicationAnswers).omit({ id: true });
export type InsertApplicationAnswer = z.infer<typeof insertApplicationAnswerSchema>;
export type ApplicationAnswer = typeof applicationAnswers.$inferSelect;

export const activityLog = pgTable("activity_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id"),
  action: text("action").notNull(),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLog.$inferSelect;

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
});

export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export const importLog = pgTable("import_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url").notNull().default(""),
  status: text("status").notNull().default("success"),
  jobId: integer("job_id"),
  jobTitle: text("job_title").notNull().default(""),
  jobCompany: text("job_company").notNull().default(""),
  errorMessage: text("error_message").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertImportLogSchema = createInsertSchema(importLog).omit({ id: true, createdAt: true });
export type InsertImportLog = z.infer<typeof insertImportLogSchema>;
export type ImportLog = typeof importLog.$inferSelect;

export const discoveryRuns = pgTable("discovery_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  status: text("status").notNull().default("running"),
  jobsFound: integer("jobs_found").notNull().default(0),
  jobsImported: integer("jobs_imported").notNull().default(0),
  jobsDuplicate: integer("jobs_duplicate").notNull().default(0),
  jobsFailed: integer("jobs_failed").notNull().default(0),
  sourcesSearched: text("sources_searched").array().notNull().default(sql`ARRAY[]::text[]`),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertDiscoveryRunSchema = createInsertSchema(discoveryRuns).omit({ id: true, startedAt: true });
export type InsertDiscoveryRun = z.infer<typeof insertDiscoveryRunSchema>;
export type DiscoveryRun = typeof discoveryRuns.$inferSelect;

export const discoveryResults = pgTable("discovery_results", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  runId: integer("run_id").notNull(),
  jobTitle: text("job_title").notNull().default(""),
  jobCompany: text("job_company").notNull().default(""),
  source: text("source").notNull().default(""),
  location: text("location").notNull().default(""),
  applyLink: text("apply_link").notNull().default(""),
  importResult: text("import_result").notNull().default("pending"),
  isDuplicate: boolean("is_duplicate").notNull().default(false),
  classification: text("classification").notNull().default(""),
  recommendedResume: text("recommended_resume").notNull().default(""),
  matchScore: text("match_score").notNull().default(""),
  freshnessLabel: text("freshness_label").notNull().default(""),
  jobId: integer("job_id"),
  errorMessage: text("error_message").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDiscoveryResultSchema = createInsertSchema(discoveryResults).omit({ id: true, createdAt: true });
export type InsertDiscoveryResult = z.infer<typeof insertDiscoveryResultSchema>;
export type DiscoveryResult = typeof discoveryResults.$inferSelect;

export const JOB_STATUSES = ["New", "Reviewed", "Ready to Apply", "Applied", "Skipped", "Interview", "Rejected"] as const;
export const ROLE_TYPES = ["Data Analyst", "Healthcare Data Analyst", "Healthcare Analyst", "Business Analyst", "Unknown"] as const;
export const FIT_LABELS = ["Strong Match", "Possible Match", "Weak Match"] as const;
export const WORK_MODES = ["Remote", "Hybrid", "Onsite"] as const;
export const PRIORITIES = ["High", "Medium", "Low"] as const;
export const FRESHNESS_LABELS = ["Fresh 24h", "Fresh 48h", "Unknown Date"] as const;
