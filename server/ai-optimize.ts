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

// ─── Legacy one-shot optimization (kept for compatibility) ───────
export interface AIOptimizeResult {
  tailoredResume: string;
  missingKeywords: string[];
  skillsToHighlight: string[];
  addedKeywords: string[];
  stillMissingKeywords: string[];
  beforeScore: number;
  afterScore: number;
  afterScoreBreakdown: ScoreBreakdown;
  usedEnrichmentPass: boolean;
}

const FIRST_PASS_PROMPT = `Act as a senior resume writer and hiring manager. Rewrite the candidate's resume to be more competitive for the given job description. Keep all changes truthful and directly supported by existing experience. No buzzwords. No fabricated experience. Return the full tailored resume only, no commentary.`;

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
      { role: "system", content: FIRST_PASS_PROMPT },
      { role: "user", content: `RESUME:\n${resumeText}\n\nJOB:\n${jobDescription}\n\nMISSING KEYWORDS:\n${missingKeywords.join(", ")}` },
    ],
    temperature: 0.35,
    max_tokens: 2500,
  });

  const tailoredResume = response.choices[0]?.message?.content?.trim() ?? "";
  const finalBreakdown = calculateATSBreakdown(tailoredResume, jobDescription);

  const phraseTest = (text: string, kw: string) =>
    new RegExp(`(?<![a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i").test(text);

  return {
    tailoredResume,
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
