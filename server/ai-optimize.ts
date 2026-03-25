import OpenAI from "openai";
import { calculateATSBreakdown, type ScoreBreakdown } from "./ats";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Keyword list used for extraction ────────────────────────────
const HIGHLIGHT_TERMS = [
  "sql", "python", "excel", "tableau", "power bi", "powerbi", "looker",
  "dbt", "spark", "pyspark", "hadoop", "aws", "azure", "gcp", "snowflake",
  "databricks", "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch",
  "javascript", "typescript", "react", "java", "scala",
  "airflow", "kubernetes", "docker", "git", "jira", "confluence",
  "salesforce", "sap", "oracle", "mysql", "postgresql", "mongodb",
  "redis", "kafka", "bigquery", "redshift", "alteryx", "qlik",
  "ssrs", "ssis", "ssas", "etl", "elt", "terraform",
  "hipaa", "hl7", "fhir", "epic", "cerner", "icd",
  "r language", "r programming",
  // Phrases
  "data analyst", "business analyst", "healthcare analyst", "data scientist",
  "data engineer", "business intelligence", "machine learning", "deep learning",
  "data pipeline", "data warehouse", "data modeling", "data quality",
  "data governance", "population health", "clinical data",
  "revenue cycle", "a/b testing", "root cause analysis",
  "statistical analysis", "predictive modeling", "trend analysis",
  "requirements gathering", "process improvement", "gap analysis",
  "cross-functional", "executive reporting", "stakeholder management",
  "agile", "scrum", "etl pipeline", "data integration",
  "data transformation", "data validation", "data cleaning",
  "kpi", "analytics", "reporting", "dashboard", "visualization",
  "forecasting", "healthcare", "clinical", "compliance", "automation",
];

export function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return HIGHLIGHT_TERMS.filter(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(lower);
  });
}

// ─── Suggestion types ────────────────────────────────────────────
export interface Suggestion {
  id: string;
  keyword: string;
  section: "skills" | "experience" | "projects" | "summary";
  currentText: string;
  suggestedText: string;
  reason: string;
}

// ─── Generate interactive suggestions ───────────────────────────
const SUGGESTION_SYSTEM_PROMPT = `You are an expert resume writer and ATS specialist.

Given a candidate's resume, a job description, and a list of missing keywords, generate specific, truthful suggestions for integrating those keywords.

For each suggestion:
1. Find the most appropriate existing line or phrase in the resume to improve
2. Copy that EXACT text from the resume as "currentText" — it must be a verbatim substring
3. Write the improved version as "suggestedText" with the keyword naturally integrated
4. Only suggest changes that are truthful and supported by existing experience
5. Never invent new companies, job titles, achievements, or tools
6. Never use weak phrases like "familiar with" or "exposure to" unless they're already there

Return a JSON object like this:
{
  "suggestions": [
    {
      "id": "1",
      "keyword": "machine learning",
      "section": "skills",
      "currentText": "exact verbatim line from the resume",
      "suggestedText": "improved version with keyword naturally woven in",
      "reason": "One sentence: why this addition is honest and relevant"
    }
  ]
}

Rules:
- Maximum 10 suggestions
- Skip any keyword that cannot be truthfully integrated
- Sort by highest ATS impact first
- currentText MUST match the resume exactly (whitespace and punctuation included)
- Target different sections when possible — spread changes across skills, experience, summary
- Keep suggestedText concise. Do not expand bullet points into paragraphs.`;

export async function generateSuggestions(
  resumeText: string,
  jobDescription: string,
  missingKeywords: string[]
): Promise<Suggestion[]> {
  if (!missingKeywords.length) return [];

  const userMessage = `RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

MISSING KEYWORDS TO INTEGRATE (only include if truthfully supported):
${missingKeywords.slice(0, 20).join(", ")}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SUGGESTION_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 3000,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  const suggestions: Suggestion[] = (parsed.suggestions ?? []).map((s: any, i: number) => ({
    id: String(s.id ?? i + 1),
    keyword: String(s.keyword ?? ""),
    section: (["skills", "experience", "projects", "summary"].includes(s.section) ? s.section : "experience") as Suggestion["section"],
    currentText: String(s.currentText ?? ""),
    suggestedText: String(s.suggestedText ?? ""),
    reason: String(s.reason ?? ""),
  })).filter((s: Suggestion) =>
    s.keyword && s.currentText && s.suggestedText && s.currentText !== s.suggestedText
  );

  return suggestions;
}

// ─── Structured sections returned by the AI ──────────────────────
export interface Resumesections {
  name: string;
  contact: string;
  summary: string;
  skills: string;
  experience: string;
  projects: string;
  education: string;
  certifications: string;
}

export interface AIOptimizeResult {
  tailoredResume: string;
  sections: Resumesections;
  missingKeywords: string[];
  skillsToHighlight: string[];
  addedKeywords: string[];
  stillMissingKeywords: string[];
  beforeScore: number;
  afterScore: number;
  afterScoreBreakdown: ScoreBreakdown;
  usedEnrichmentPass: boolean;
}

// ─── Structured optimization prompt ──────────────────────────────
// The AI returns a JSON object with each resume section separately.
// This feeds directly into the template-based DOCX/PDF generator
// without requiring any further text-to-sections parsing.
const STRUCTURED_OPTIMIZE_PROMPT = `You are a senior ATS resume writer and hiring specialist.

Rewrite the candidate's resume to be highly competitive for the given job description.
Return a JSON object with EXACTLY these keys — no other keys, no extra text:

{
  "name": "candidate full name (copy exactly from original)",
  "contact": "single contact line: email | phone | linkedin (copy exactly from original)",
  "summary": "3-sentence professional summary tailored to this job. Strong action opening. 2-3 role-relevant keywords naturally integrated.",
  "skills": "comma-separated skills list. Put the most job-relevant skills first. Include only skills the candidate truthfully has.",
  "experience": "full experience section. Each job: 'Company | Title | Start – End' on one line, then 3-6 bullet points each starting with •. Bullets must start with strong action verbs. Include metrics where the original has them.",
  "projects": "full projects section in same format as experience, or empty string if original has none",
  "education": "education section — copy exactly from original, including institution, degree, and year",
  "certifications": "certifications section — copy exactly from original, or empty string if none"
}

Absolute rules:
- NEVER invent companies, titles, dates, degrees, metrics, or tools not in the original resume
- Only add keywords that are truthfully supported by demonstrated experience
- Use • (bullet character) for all bullets — never use dash or asterisk
- Keep all dates, company names, and job titles exactly as in the original
- Return ONLY the JSON object — no markdown, no fences, no commentary`;

export async function aiOptimizeResume(
  resumeText: string,
  jobDescription: string
): Promise<AIOptimizeResult> {
  const resumeKws = new Set(extractKeywords(resumeText));
  const jobKws = extractKeywords(jobDescription);
  const missingKeywords = jobKws.filter(k => !resumeKws.has(k));
  const skillsToHighlight = jobKws.filter(k => resumeKws.has(k));
  const beforeScore = calculateATSBreakdown(resumeText, jobDescription).atsScore;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: STRUCTURED_OPTIMIZE_PROMPT },
      {
        role: "user",
        content: `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription.slice(0, 6000)}\n\nMISSING KEYWORDS TO INTEGRATE (only if truthfully supported):\n${missingKeywords.join(", ")}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 3000,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const sections: Resumesections = {
    name:           String(parsed.name           ?? ""),
    contact:        String(parsed.contact        ?? ""),
    summary:        String(parsed.summary        ?? ""),
    skills:         String(parsed.skills         ?? ""),
    experience:     String(parsed.experience     ?? ""),
    projects:       String(parsed.projects       ?? ""),
    education:      String(parsed.education      ?? ""),
    certifications: String(parsed.certifications ?? ""),
  };

  // Reconstruct a single text block from sections for the editor and scoring
  const sectionLines = [
    sections.name,
    sections.contact,
    "",
    "SUMMARY",
    sections.summary,
    "",
    "SKILLS",
    sections.skills,
    "",
    "EXPERIENCE",
    sections.experience,
  ];
  if (sections.projects.trim()) {
    sectionLines.push("", "PROJECTS", sections.projects);
  }
  sectionLines.push("", "EDUCATION", sections.education);
  if (sections.certifications.trim()) {
    sectionLines.push("", "CERTIFICATIONS", sections.certifications);
  }
  const tailoredResume = sectionLines.join("\n").trim();

  const finalBreakdown = calculateATSBreakdown(tailoredResume, jobDescription);

  const phraseTest = (text: string, kw: string) =>
    new RegExp(`(?<![a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i").test(text);

  return {
    tailoredResume,
    sections,
    missingKeywords,
    skillsToHighlight,
    addedKeywords: missingKeywords.filter(k => phraseTest(tailoredResume, k)),
    stillMissingKeywords: missingKeywords.filter(k => !phraseTest(tailoredResume, k)),
    beforeScore,
    afterScore: finalBreakdown.atsScore,
    afterScoreBreakdown: finalBreakdown,
    usedEnrichmentPass: false,
  };
}

// ─── Cover Letter Generator ───────────────────────────────────────
const COVER_LETTER_SYSTEM_PROMPT = `You are an expert career coach and professional cover letter writer.

Given a candidate's resume, job description, company name, and job title, write a concise, compelling cover letter.

Rules:
1. Only reference skills and experience that actually appear in the resume — never fabricate anything
2. Focus on the most relevant skills and accomplishments for this specific role
3. Keep it to 3-4 short paragraphs (250-350 words)
4. Open with a strong hook about the specific role and company
5. Highlight 2-3 concrete achievements with metrics from the resume
6. Close with enthusiasm and a clear call to action
7. Use a professional but personable tone
8. Do NOT include "Dear Hiring Manager," or any salutation or signature line — just the body paragraphs
9. Do not start with "I" — vary your sentence structure
10. Output plain text only, no markdown`;

export async function generateCoverLetter(
  resumeText: string,
  jobDescription: string,
  company: string,
  jobTitle: string
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("No OpenAI API key configured");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: COVER_LETTER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `COMPANY: ${company}
JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription.slice(0, 6000)}

RESUME:
${resumeText.slice(0, 6000)}

Write the cover letter body paragraphs now.`,
      },
    ],
    temperature: 0.7,
    max_tokens: 800,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
