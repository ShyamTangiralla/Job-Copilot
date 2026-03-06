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
- `jobs` - Job listings with classification, fit scoring, and status tracking
- `application_answers` - Standard Q&A pairs for common application questions
- `activity_log` - Tracks status changes and actions
- `settings` - Configurable role categories, sources, and statuses (stored as JSONB)

## Pages

1. **Overview** (`/`) - Dashboard with stats cards and recent jobs
2. **Jobs Inbox** (`/jobs`) - Filterable job table with add/search functionality
3. **Job Detail** (`/jobs/:id`) - Full job view with status buttons, notes, recommended resume, and profile info
4. **Resume Vault** (`/resumes`) - CRUD for master resumes with active/inactive toggle
5. **Candidate Profile** (`/profile`) - Personal info form and standard application answers
6. **Tracker** (`/tracker`) - Application pipeline with summary cards and breakdown by source/role
7. **Settings** (`/settings`) - Manage role categories, sources, and statuses

## Job Classification

Jobs are classified based on title/description keyword matching into: Data Analyst, Healthcare Data Analyst, Healthcare Analyst, Business Analyst, or Unknown.

## Fit Scoring

Simple label-based scoring (Strong Match, Possible Match, Weak Match) based on keyword overlap for analytics terms.

## Key Files

- `shared/schema.ts` - All Drizzle schemas and TypeScript types
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface and database implementation
- `server/routes.ts` - API endpoints
- `server/seed.ts` - Sample seed data
- `client/src/App.tsx` - Main app with routing and sidebar layout
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/pages/` - All page components
