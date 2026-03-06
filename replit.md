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
- `resumes` - Master resumes tagged by role type (Data Analyst, Healthcare Data Analyst, Healthcare Analyst, Business Analyst)
- `jobs` - Job listings with classification, fit scoring, status tracking, priority (High/Medium/Low), and follow-up dates
- `application_answers` - Standard Q&A pairs for common application questions
- `activity_log` - Tracks status changes and actions
- `settings` - Configurable role categories, sources, and statuses (stored as JSONB)

## Pages

1. **Overview** (`/`) - Dashboard with stats cards and recent jobs
2. **Jobs Inbox** (`/jobs`) - Filterable job table with Quick Add (duplicate detection), priority filter, follow-up dates
3. **Job Detail** (`/jobs/:id`) - Full job view with status buttons, priority selector, follow-up date, missing info warnings, notes, recommended resume
4. **Resume Vault** (`/resumes`) - CRUD for master resumes with active/inactive toggle
5. **Candidate Profile** (`/profile`) - Personal info form and standard application answers
6. **Tracker** (`/tracker`) - Kanban board (drag-and-drop), Table view, Analytics tab (charts for applications by day/source, interviews by resume type, pipeline summary), CSV export
7. **Settings** (`/settings`) - Manage role categories, sources, and statuses

## Job Classification

Jobs are classified based on title/description keyword matching into: Data Analyst, Healthcare Data Analyst, Healthcare Analyst, Business Analyst, or Unknown.

## Fit Scoring

Simple label-based scoring (Strong Match, Possible Match, Weak Match) based on keyword overlap for analytics terms.

## API Endpoints

- `GET/POST /api/jobs` - List/create jobs
- `GET/PATCH /api/jobs/:id` - Get/update job
- `POST /api/jobs/check-duplicate` - Check for duplicate jobs (title, company, applyLink)
- `GET /api/jobs/export/csv` - Export all jobs as CSV
- `GET/POST /api/resumes` - List/create resumes
- `PATCH /api/resumes/:id` - Update resume
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
- `server/seed.ts` - Sample seed data
- `client/src/App.tsx` - Main app with routing and sidebar layout
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/pages/` - All page components

## Constants

Exported from `shared/schema.ts`: JOB_STATUSES, ROLE_TYPES, FIT_LABELS, WORK_MODES, PRIORITIES
