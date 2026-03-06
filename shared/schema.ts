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
  status: text("status").notNull().default("New"),
  notes: text("notes").notNull().default(""),
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

export const JOB_STATUSES = ["New", "Reviewed", "Ready to Apply", "Applied", "Skipped", "Interview", "Rejected"] as const;
export const ROLE_TYPES = ["Data Analyst", "Healthcare Data Analyst", "Healthcare Analyst", "Business Analyst", "Unknown"] as const;
export const FIT_LABELS = ["Strong Match", "Possible Match", "Weak Match"] as const;
export const WORK_MODES = ["Remote", "Hybrid", "Onsite"] as const;
