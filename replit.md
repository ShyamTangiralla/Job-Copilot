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
- `settings` - Configurable role categories, sources, and statuses (stored as JSONB)
- `import_log` - Tracks job import history (sourceType, sourceUrl, status, jobId, jobTitle, jobCompany, errorMessage)

## Pages

1. **Overview** (`/`) - Dashboard with stats cards and recent jobs
2. **Job Intake** (`/intake`) - Import jobs via URL scraping, email alert parsing, or bulk paste; import history dashboard with stats
3. **Jobs Inbox** (`/jobs`) - Filterable job table with Quick Add (duplicate detection), priority filter, follow-up dates
4. **Job Detail** (`/jobs/:id`) - Full job view with status buttons, priority selector, follow-up date, missing info warnings, notes, recommended resume
5. **Resume Vault** (`/resumes`) - CRUD for master resumes with active/inactive toggle
6. **Candidate Profile** (`/profile`) - Personal info form and standard application answers
7. **Tracker** (`/tracker`) - Kanban board (drag-and-drop), Table view, Analytics tab (charts for applications by day/source, interviews by resume type, pipeline summary), CSV export
8. **Settings** (`/settings`) - Manage role categories, sources, and statuses

## Job Intake System

Three import methods:
- **Paste URL**: Fetches job page, extracts data via JSON-LD and HTML parsing (cheerio), auto-detects source
- **Email Alert**: Parses raw email text for job listings using pattern matching, extracts title/company/location/links
- **Bulk Paste**: Multiple URLs (one per line) or multiple job descriptions separated by blank lines

All imports: auto-classify role type, recommend resume, assign fit score, set status=New, detect duplicates (title+company or apply link).

## Job Classification

Jobs are classified based on title/description keyword matching into: Data Analyst, Healthcare Data Analyst, Healthcare Analyst, Business Analyst, or Unknown.

## Fit Scoring

Simple label-based scoring (Strong Match, Possible Match, Weak Match) based on keyword overlap for analytics terms.

## API Endpoints

- `GET/POST /api/jobs` - List/create jobs
- `GET/PATCH /api/jobs/:id` - Get/update job
- `POST /api/jobs/check-duplicate` - Check for duplicate jobs (title, company, applyLink)
- `GET /api/jobs/export/csv` - Export all jobs as CSV
- `POST /api/intake/url` - Import job from URL (scrape and create)
- `POST /api/intake/email` - Parse email content and import jobs
- `POST /api/intake/bulk` - Bulk import from URLs or descriptions
- `GET /api/intake/history` - Get import log history
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
- `server/seed.ts` - Sample seed data
- `client/src/App.tsx` - Main app with routing and sidebar layout
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/pages/` - All page components

## Constants

Exported from `shared/schema.ts`: JOB_STATUSES, ROLE_TYPES, FIT_LABELS, WORK_MODES, PRIORITIES
