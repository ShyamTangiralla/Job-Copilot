# Job Application Copilot

A web application for managing high-volume job applications using pre-approved master resumes.

## Overview

This app helps manage the job application workflow: classify jobs by role type, recommend matching resumes, prepare saved application details, and track progress. It includes a human approval step before submission.

## Architecture

- **Frontend**: React + Vite + TypeScript with Tailwind CSS and shadcn/ui components
- **Backend**: Express.js REST API
- **Database**: PostgreSQL via Drizzle ORM
- **Routing**: wouter
- **State Management**: TanStack React Query

## Data Model

- `candidate_profile` - Personal info, work authorization, preferences
- `resumes` - Master resumes tagged by role type with file upload support (fileName, filePath, fileType columns)
- `jobs` - Job listings with classification, fit scoring, status tracking, priority (High/Medium/Low), follow-up dates, importSource, importedAt
- `application_answers` - Standard Q&A pairs for common application questions
- `tailored_resumes` - Tailored resume versions per job (jobId, resumeId, originalText, tailoredText, keywordAnalysis, improvements, matchBefore, matchAfter, improvementSummary)
- `activity_log` - Tracks status changes and actions
- `settings` - Configurable role categories, sources, and statuses (stored as JSONB); also stores discovery settings under key "discovery" and scoring weights under key "scoringWeights"
- `import_log` - Tracks job import history (sourceType, sourceUrl, status, jobId, jobTitle, jobCompany, errorMessage, duplicateReason, duplicateJobId)
- `discovery_runs` - Tracks each discovery run (status, jobsFound, jobsImported, jobsDuplicate, jobsFailed, sourcesSearched, timestamps)
- `discovery_results` - Individual results from discovery runs (jobTitle, jobCompany, source, importResult, isDuplicate, classification, recommendedResume, matchScore, duplicateReason, duplicateJobId)

## Pages

1. **Overview** (`/`) - Dashboard with stats cards and recent jobs
2. **Job Discovery** (`/discovery`) - Automated job search from public sources (Greenhouse, Lever, Google Jobs); configurable target roles, locations, keywords, sources; run/stop controls; results dashboard; debug panel showing duplicate reasons and failure details; history table
3. **Job Intake** (`/intake`) - Import jobs via URL scraping, bulk URL import (20-200 URLs), email alert parsing, or bulk paste; import history with duplicate reason display
4. **Quick Capture** (`/quick-capture`) - Bookmarklet helper page; captures browser URL and opens Job Intake with it prefilled; shows import/duplicate/fail result with duplicate reason
5. **Jobs Inbox** (`/jobs`) - Filterable job table with Quick Add, quick filters for mass apply (Imported Today, Last 72h, Last 7d, Score ≥ 60, Score ≥ 70, Primary Role, Remote Only)
6. **Job Detail** (`/jobs/:id`) - Full job view with status buttons, priority selector, follow-up date, missing info warnings, notes, recommended resume, Resume Tailoring Assistant
7. **Resume Vault** (`/resumes`) - CRUD for master resumes with active/inactive toggle
8. **Candidate Profile** (`/profile`) - Personal info form and standard application answers
9. **Tracker** (`/tracker`) - Kanban board (drag-and-drop), Table view, Analytics tab, CSV export
10. **Settings** (`/settings`) - Manage role categories, sources, statuses, and scoring weights
11. **Interview Tracker** (`/interviews`) - Track interview rounds, results, and schedule
12. **Offer Tracker** (`/offers`) - Track offers with salary, deadline, decision status
13. **Networking Tracker** (`/networking`) - Track contacts (recruiters, referrals, connections) with follow-up reminders, linked jobs, and contact details
14. **Analytics** (`/analytics`) - 6-tab dashboard: Pipeline, Applications, Resume, Time, Job Market, Salary

## Job Discovery System

Searches public job board APIs:
- **Greenhouse**: Uses public boards API (`boards-api.greenhouse.io/v1/boards/{company}/jobs`) - 40+ boards including healthcare companies
- **Lever**: Uses public postings API (`api.lever.co/v0/postings/{company}`) - 35+ companies including healthcare
- **Google Jobs**: Scrapes Google search results for structured job data

Default target roles (20 variations):
Data Analyst, Junior Data Analyst, Entry Level Data Analyst, Business Analyst, Business Data Analyst, Business Intelligence Analyst, BI Analyst, Reporting Analyst, Analytics Analyst, Product Analyst, Operations Analyst, Financial Analyst, Healthcare Data Analyst, Clinical Data Analyst, Marketing Analyst, Customer Insights Analyst, Data Quality Analyst, Data Operations Analyst, Analytics Associate, SQL Analyst

Discovery defaults: maxJobsPerScan=300, dailyImportCap=300

## Duplicate Detection

URL-first duplicate detection:
1. **Primary**: Normalized URL comparison (strips tracking params, trailing slashes, protocol)
2. **Fallback** (only when URL missing): normalized company + normalized title + posted date

Duplicate reasons stored: "duplicate by URL", "duplicate by title+company+date"

Does NOT mark jobs as duplicates just because titles are similar or from different URLs.

## Freshness Filtering

Discovery system uses expanded freshness tiers:
- **Fresh 24h**: Posted within last 24 hours (highest priority)
- **Fresh 48h**: Posted within last 48 hours
- **Fresh 72h**: Posted within last 72 hours (preferred tier)
- **Fresh 7d**: Posted within last 7 days (fallback tier)
- **Unknown Date**: No valid posting date
- **Too Old**: >7 days, excluded from import

Default: 72h preferred, 7d fallback, skip >7d

## Job Intake System

Four import methods:
- **Paste URL**: Fetches job page, extracts data via JSON-LD and HTML parsing (cheerio), auto-detects source
- **Bulk URL Import**: Paste 20-200 URLs (one per line), each scraped and imported with per-row result showing imported/duplicate/failed with reasons
- **Email Alert**: Parses raw email text for job listings using pattern matching
- **Bulk Paste**: Multiple job descriptions separated by blank lines

All imports: auto-classify role type, recommend resume, assign fit score, set status=New, URL-based duplicate detection. Duplicate results include the existing matching job and the reason.

## Apply Priority Score

Composite 0-100 score per job ranking which jobs to apply to first. Computed from 7 weighted factors:
1. **Role Match** (max 25pts): Primary roles = 25, secondary = 12
2. **Freshness** (max 20pts): Fresh 24h = 20, Fresh 48h = 16, Fresh 72h = 12, Fresh 7d = 7, Unknown = 3
3. **Experience Level** (max 15pts): Entry/analyst = 15, mid = 8, senior = 0
4. **Keyword Match** (max 15pts): SQL, Python, Tableau, Power BI, Excel, dashboards, reporting, analytics, healthcare analytics, business intelligence, ETL, data visualization
5. **Location & Work Mode** (max 15pts): Remote = 10, Hybrid = 8, preferred location bonus = 5
6. **Resume Match** (max 5pts): Has resume recommendation = 5
7. **Source Quality** (max 5pts): Greenhouse/Lever/Workday = 5, generic = 1

Priority labels: ≥85 "Apply Immediately", ≥70 "High Priority", ≥55 "Medium Priority", <55 "Low Priority"

Auto-status: Score ≥85 → "Ready to Apply" from discovery. Does NOT auto-submit applications.

## API Endpoints

- `GET/POST /api/jobs` - List/create jobs
- `GET/PATCH /api/jobs/:id` - Get/update job
- `POST /api/jobs/check-duplicate` - Check for duplicate jobs (returns isDuplicate, existingJob, duplicateReason)
- `GET /api/jobs/export/csv` - Export all jobs as CSV
- `POST /api/jobs/recalculate-scores` - Recalculate all job priority scores
- `POST /api/intake/url` - Import job from URL (returns duplicate info on conflict)
- `POST /api/intake/bulk-urls` - Bulk URL import (20-200 URLs, per-row results)
- `POST /api/intake/email` - Parse email content and import jobs
- `POST /api/intake/bulk` - Bulk import from descriptions
- `GET /api/intake/history` - Get import log history
- `GET/PUT /api/discovery/settings` - Get/update discovery settings
- `POST /api/discovery/run` - Start a discovery run
- `POST /api/discovery/stop` - Stop running discovery
- `GET /api/discovery/status` - Get current discovery status and latest run
- `GET /api/discovery/runs` - Get all discovery runs
- `GET /api/discovery/runs/:id` - Get specific discovery run
- `GET /api/discovery/results` - Get discovery results (optional ?runId= filter)
- `GET/PUT /api/scoring-weights` - Get/update scoring weight settings
- `GET/POST /api/resumes` - List/create resumes
- `PATCH /api/resumes/:id` - Update resume
- `POST /api/resumes/:id/upload` - Upload resume file
- `GET /api/resumes/:id/file` - View resume file inline
- `GET /api/resumes/:id/download` - Download resume file
- `DELETE /api/resumes/:id/file` - Remove uploaded file
- `GET/PATCH /api/profile` - Get/update candidate profile
- `GET/POST /api/answers` - List/create application answers
- `PATCH/DELETE /api/answers/:id` - Update/delete answer
- `GET /api/activity` - Get activity log
- `GET/PATCH /api/settings` - Get/update settings
- `POST /api/tailoring/analyze` - Analyze resume against job description (keyword gaps, suggestions, tailored draft)
- `POST /api/tailoring/save` - Save tailored resume to job history
- `POST /api/tailoring/save-as-resume` - Save tailored version as new resume in vault
- `GET /api/tailoring/history/:jobId` - Get tailoring history for a job
- `DELETE /api/tailoring/:id` - Delete a tailored resume

## Resume Tailoring Assistant

Algorithmic resume tailoring engine on the Job Detail page. Compares a selected master resume against the job description to produce keyword gap analysis, suggested improvements, and a tailored draft.

Features:
- **Keyword Gap Analysis**: Extracts keywords from job description and resume, identifies matched/missing/weak keywords
- **Suggested Improvements**: Rule-based bullet point improvements that naturally integrate missing keywords
- **Tailored Draft**: Modified resume with keywords woven in and weak phrasing strengthened
- **Manual Edit Mode**: Edit the tailored draft inline before saving or copying (Edit Draft / Done Editing toggle)
- **ATS Match Score**: Before/after percentage based on keyword and bigram overlap
- **Save Options**: Copy to clipboard, save to job history, or save as new resume in vault
- **Tailoring History**: View/copy/delete past tailoring runs per job

Protection Rules (enforced by the engine):
- **Locked sections**: Education, Certifications, Achievements, Awards, Publications — never modified
- **Protected lines**: Date ranges (MM/YYYY – MM/YYYY, YYYY – YYYY, month patterns), section headers, company names, job titles, degree names, university names
- **Editable only**: Bullet points in Experience/Projects, Skills section lines (comma/pipe/colon-separated or bullets)
- Date detection: any line matching date range patterns is automatically locked

Resume Writing Style Rules (enforced by the engine):
- 6 bullets per experience section: 3 strong action verbs (Led, Built, Designed, etc.), 3 neutral verbs (Analyzed, Conducted, Supported, etc.)
- Professional, natural, human-sounding tone; no buzzwords or generic phrases
- Keywords only when they fit naturally within real experience
- Preserve existing resume format, section order, layout
- One page, ~550-700 words
- Never fabricate experience, invent tools, change metrics, or exaggerate

Keyword databases by role: Data Analyst, Healthcare Data Analyst, Business Analyst, Financial Analyst

## Key Files

- `shared/schema.ts` - All Drizzle schemas and TypeScript types
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface, database implementation, URL normalization, duplicate detection, scoring
- `server/routes.ts` - API endpoints
- `server/scraper.ts` - URL scraping (cheerio), email parsing, bulk input parsing
- `server/discovery.ts` - Job discovery engine (Greenhouse, Lever, Google Jobs search)
- `server/tailoring.ts` - Resume tailoring engine (keyword extraction, gap analysis, rule-based suggestions, ATS scoring)
- `server/docx-export.ts` - ATS resume export: section parser, DOCX generator (`docx` package), PDF generator (`pdfkit`), docxtemplater integration for custom templates
- `client/src/lib/export-resume.ts` - Client export helpers: exportTxt (plain text), exportResumeDocx (server-side DOCX), exportResumePdf (server-side PDF), fetchResumeSections (preview)
- `client/src/pages/` - All page components

## Constants

Exported from `shared/schema.ts`: JOB_STATUSES, ROLE_TYPES, FIT_LABELS, WORK_MODES, PRIORITIES, FRESHNESS_LABELS, APPLY_PRIORITY_LABELS
