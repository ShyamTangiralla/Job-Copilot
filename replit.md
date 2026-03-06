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
- `jobs` - Job listings with classification, fit scoring, status tracking, priority (High/Medium/Low), and follow-up dates
- `application_answers` - Standard Q&A pairs for common application questions
- `activity_log` - Tracks status changes and actions
- `settings` - Configurable role categories, sources, and statuses (stored as JSONB); also stores discovery settings under key "discovery"
- `import_log` - Tracks job import history (sourceType, sourceUrl, status, jobId, jobTitle, jobCompany, errorMessage)
- `discovery_runs` - Tracks each discovery run (status, jobsFound, jobsImported, jobsDuplicate, jobsFailed, sourcesSearched, timestamps)
- `discovery_results` - Individual results from discovery runs (jobTitle, jobCompany, source, importResult, isDuplicate, classification, recommendedResume, matchScore)

## Pages

1. **Overview** (`/`) - Dashboard with stats cards and recent jobs
2. **Job Discovery** (`/discovery`) - Automated job search from public sources (Greenhouse, Lever, Google Jobs); configurable target roles, locations, keywords, sources; run/stop controls; results dashboard and history table
3. **Job Intake** (`/intake`) - Import jobs via URL scraping, email alert parsing, or bulk paste; import history dashboard with stats
4. **Quick Capture** (`/quick-capture`) - Bookmarklet helper page; drag-to-install bookmarklet that captures current browser URL and opens Job Intake with it prefilled; auto-imports on arrival
5. **Jobs Inbox** (`/jobs`) - Filterable job table with Quick Add (duplicate detection), priority filter, follow-up dates
6. **Job Detail** (`/jobs/:id`) - Full job view with status buttons, priority selector, follow-up date, missing info warnings, notes, recommended resume
7. **Resume Vault** (`/resumes`) - CRUD for master resumes with active/inactive toggle
8. **Candidate Profile** (`/profile`) - Personal info form and standard application answers
9. **Tracker** (`/tracker`) - Kanban board (drag-and-drop), Table view, Analytics tab (charts for applications by day/source, interviews by resume type, pipeline summary), CSV export
10. **Settings** (`/settings`) - Manage role categories, sources, and statuses

## Job Discovery System

Searches public job board APIs:
- **Greenhouse**: Uses public boards API (`boards-api.greenhouse.io/v1/boards/{company}/jobs`)
- **Lever**: Uses public postings API (`api.lever.co/v0/postings/{company}`)
- **Google Jobs**: Scrapes Google search results for structured job data

Configuration stored in settings table under key "discovery":
- Primary/secondary target roles, preferred locations, work modes
- Max jobs per scan, search keywords, exclude keywords, job age filter
- Source toggles (Google Jobs, Greenhouse, Lever, Workday, Company Career Pages, Email Alerts)
- Scheduler (Manual Only, Daily, Twice Daily)

Discovery runs async in background; frontend polls status. Results feed into existing Job Intake pipeline with duplicate detection.

## Job Intake System

Three import methods:
- **Paste URL**: Fetches job page, extracts data via JSON-LD and HTML parsing (cheerio), auto-detects source
- **Email Alert**: Parses raw email text for job listings using pattern matching, extracts title/company/location/links
- **Bulk Paste**: Multiple URLs (one per line) or multiple job descriptions separated by blank lines

All imports: auto-classify role type, recommend resume, assign fit score, set status=New, detect duplicates (title+company or apply link).

## Job Classification

Jobs are classified based on title/description keyword matching into: Data Analyst, Healthcare Data Analyst, Healthcare Analyst, Business Analyst, or Unknown.

## Fit Scoring (Smart Ranking)

Multi-factor scoring system evaluates discovered jobs across 5 dimensions:
1. **Role Match** (0-30 pts): Primary roles (Data Analyst, Healthcare Data Analyst, Business Analyst, Financial Analyst, BI Analyst) = 30pts; Secondary roles (Data Engineer, Data Scientist) = 15pts
2. **Experience Level** (-10 to +10 pts): Downranks senior/principal/director/staff/lead/manager titles; prefers analyst/associate/junior/entry
3. **Keyword Match** (0-40 pts, 5 each): SQL, Python, Tableau, Power BI, healthcare analytics, dashboards, ETL, data visualization
4. **Location Match** (0-10 pts): Remote, United States, New York
5. **Source Priority** (0-5 pts): Greenhouse, Lever, Workday, Company Career Pages preferred

Score categories: Strong Match (≥40), Possible Match (≥20), Weak Match (<20)

Status assignment from discovery: Strong → "Ready to Apply", Possible → "New", Weak → "Skipped"

## Freshness Filtering

Discovery system prioritizes fresh jobs:
- **Fresh 24h**: Posted within last 24 hours (highest priority)
- **Fresh 48h**: Posted within last 48 hours (fallback)
- **Unknown Date**: No valid posting date (lowest priority)
- **Too Old**: >48 hours, excluded from import

Discovery settings include:
- `preferredFreshness`: "Last 24 hours only" or "Last 24 hours preferred, fallback to 48 hours"
- `dailyImportCap`: 100, 150, or 200 (default 150)

Sort order: Fresh 24h → Fresh 48h → Unknown Date, then Strong Match → Possible → Weak, then primary roles → secondary.

Jobs Inbox sorts by: Freshness → Ready to Apply status → Strong Match first.
Jobs have `freshnessLabel` column. Discovery results have `freshnessLabel` column.
Discovery History shows Freshness and Match Score columns.
Overview dashboard shows Fresh 24h and Fresh 48h stat cards.

## API Endpoints

- `GET/POST /api/jobs` - List/create jobs
- `GET/PATCH /api/jobs/:id` - Get/update job
- `POST /api/jobs/check-duplicate` - Check for duplicate jobs (title, company, applyLink)
- `GET /api/jobs/export/csv` - Export all jobs as CSV
- `POST /api/intake/url` - Import job from URL (scrape and create)
- `POST /api/intake/email` - Parse email content and import jobs
- `POST /api/intake/bulk` - Bulk import from URLs or descriptions
- `GET /api/intake/history` - Get import log history
- `GET/PUT /api/discovery/settings` - Get/update discovery settings
- `POST /api/discovery/run` - Start a discovery run
- `POST /api/discovery/stop` - Stop running discovery
- `GET /api/discovery/status` - Get current discovery status and latest run
- `GET /api/discovery/runs` - Get all discovery runs
- `GET /api/discovery/runs/:id` - Get specific discovery run
- `GET /api/discovery/results` - Get discovery results (optional ?runId= filter)
- `GET/POST /api/resumes` - List/create resumes
- `PATCH /api/resumes/:id` - Update resume
- `POST /api/resumes/:id/upload` - Upload resume file (PDF/DOCX, multipart form)
- `GET /api/resumes/:id/file` - View resume file inline
- `GET /api/resumes/:id/download` - Download resume file
- `DELETE /api/resumes/:id/file` - Remove uploaded file
- `GET/PATCH /api/profile` - Get/update candidate profile
- `GET/POST /api/answers` - List/create application answers
- `PATCH/DELETE /api/answers/:id` - Update/delete answer
- `GET /api/activity` - Get activity log
- `GET/PATCH /api/settings` - Get/update settings

## Key Files

- `shared/schema.ts` - All Drizzle schemas and TypeScript types
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface and database implementation
- `server/routes.ts` - API endpoints
- `server/scraper.ts` - URL scraping (cheerio), email parsing, bulk input parsing
- `server/discovery.ts` - Job discovery engine (Greenhouse, Lever, Google Jobs search)
- `server/seed.ts` - Sample seed data
- `client/src/App.tsx` - Main app with routing and sidebar layout
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/pages/` - All page components

## Apply Priority Score

Composite 0-100 score per job ranking which jobs to apply to first. Computed from 7 weighted factors:
1. **Role Match** (max 25pts): Primary roles = 25, secondary = 12
2. **Freshness** (max 20pts): Fresh 24h = 20, Fresh 48h = 12, Unknown = 5
3. **Experience Level** (max 15pts): Entry/analyst = 15, mid = 8, senior = 0
4. **Keyword Match** (max 15pts): SQL, Python, Tableau, Power BI, Excel, dashboards, reporting, analytics, healthcare analytics, business intelligence, ETL, data visualization (~1.25pt each)
5. **Location & Work Mode** (max 15pts): Remote = 10, Hybrid = 8, preferred location bonus = 5
6. **Resume Match** (max 5pts): Has resume recommendation = 5
7. **Source Quality** (max 5pts): Greenhouse/Lever/Workday = 5, generic = 1

Priority labels: ≥90 "Apply Immediately", ≥75 "High Priority", ≥60 "Medium Priority", <60 "Low Priority"

Auto-status: Score ≥90 → "Ready to Apply" from discovery. Does NOT auto-submit applications.

Scoring weights adjustable in Settings page under "Apply Priority Scoring Weights". Stored in settings table under key "scoringWeights".

Recalculate all scores via Settings → "Recalculate All Scores" button, or `POST /api/jobs/recalculate-scores`.

New fields on jobs: `applyPriorityScore`, `applyPriorityLabel`, `applyPriorityExplanation`
New fields on discovery_results: `applyPriorityScore`, `applyPriorityLabel`

Displayed on: Jobs Inbox (columns + filters), Job Detail (card with progress bar + explanation), Discovery History (columns), Tracker (badges), Overview (4 dashboard cards).

## API Endpoints (new)

- `POST /api/jobs/recalculate-scores` - Recalculate all job priority scores
- `GET/PUT /api/scoring-weights` - Get/update scoring weight settings

## Constants

Exported from `shared/schema.ts`: JOB_STATUSES, ROLE_TYPES, FIT_LABELS, WORK_MODES, PRIORITIES, APPLY_PRIORITY_LABELS
