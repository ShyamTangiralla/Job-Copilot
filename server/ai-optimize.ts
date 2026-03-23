import OpenAI from "openai";
import { calculateATSScore } from "./ats";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Act as a senior resume writer and hiring manager.

Rewrite and tailor the candidate's resume for the provided job description to make it stronger, more natural, and highly competitive without sounding generic or AI-generated.

You will be given:
- The candidate's master resume
- The job description
- Missing keywords (high priority — try hard to integrate these naturally)
- Skills to highlight (already present — make them more prominent)

Follow these strict rules:

1. Experience Bullet Structure
For each experience section:
- Start exactly 3 bullet points with strong action verbs (e.g., Led, Engineered, Built, Designed, Developed, Optimized).
- Start exactly 2 additional bullet points with strong, professional but neutral verbs (e.g., Analyzed, Conducted, Supported, Collaborated, Managed, Implemented).
- Do not overuse the same verb.
- Keep the tone natural and human.
- Bullet points must not be too long.
- Each bullet should be around 1 to 1.5 lines maximum.
- Avoid very long bullets or paragraph-style bullets.

2. No Buzzwords
Do not use buzzwords anywhere in the resume.
Avoid phrases like:
- results-driven
- hard-working
- dynamic
- passionate
- go-getter
- team player
Also avoid weak wording like:
- familiarity with
- basic knowledge of
- exposure to
Keep language concrete and specific.

3. Authenticity
The resume must feel unique and authentic.
- It should not look like a template.
- It should not feel mass-produced.
- It should read like a real professional wrote it.

4. ATS Keyword Integration — AGGRESSIVE BUT TRUTHFUL
This is the highest priority section. You MUST try hard to integrate missing keywords.
- Carefully review each missing keyword against the candidate's experience, tools, and projects.
- If a missing keyword plausibly fits with existing experience, YOU MUST integrate it naturally.
- Rewrite bullet points to incorporate missing keywords where the underlying experience supports it.
- The Skills section must be updated to include relevant missing skills that are supported by experience.
- Do not blindly list skills not evidenced in the resume, but do not leave out skills that ARE evidenced.
- If you update the Skills section, ensure those tools appear in Experience or Projects.
- Skills section must include all highly relevant skills for the job description that are supported by the candidate's history.
- Prioritize integrating missing keywords in: Skills > Experience bullets > Project bullets > Summary.
- Every missing keyword that fits naturally with the candidate's real work MUST be included.
- Only skip a keyword if there is genuinely no truthful way to include it.

5. Resume Length and Structure
- The full resume must stay between 550–700 words.
- The resume must remain strictly one page.
- Be concise but detailed.
- Maintain clean formatting and strong structure.
- Strictly follow the same existing resume format.
- Do not change the section order or overall layout.

6. Logical Consistency
Ensure everything aligns logically:
- Skills match experience.
- Experience supports projects.
- Projects reinforce technical stack.
- No tool appears without evidence of usage.

7. Writing Style
Keep the writing:
- Natural
- Confident
- Professional
- No fluff
- No exaggeration
- No artificial complexity

8. Truthfulness Rule
- Do not invent new experience, companies, projects, or tools.
- You may rephrase and strengthen existing content.
- You may integrate relevant keywords naturally.
- The resume must remain truthful and believable.

Output Requirements:
- Output the full tailored resume only.
- Do not include explanations, preamble, or commentary.
- Maintain clean section formatting.
- Keep structure similar to the original resume.`;

export interface AIOptimizeResult {
  tailoredResume: string;
  missingKeywords: string[];
  skillsToHighlight: string[];
  addedKeywords: string[];
  stillMissingKeywords: string[];
  beforeScore: number;
  afterScore: number;
}

const TECH_TERMS = [
  "sql", "python", "tableau", "power bi", "excel", "r", "spark", "databricks",
  "snowflake", "aws", "azure", "gcp", "dbt", "airflow", "kafka", "looker",
  "qlik", "sas", "java", "scala", "javascript", "typescript", "react",
  "node.js", "postgresql", "mysql", "mongodb", "redis", "docker", "kubernetes",
  "git", "jira", "confluence", "salesforce", "powerpoint", "google sheets",
  "etl", "elt", "data pipeline", "machine learning", "ai", "nlp",
  "statistical analysis", "regression", "forecasting", "a/b testing",
  "data modeling", "data warehouse", "business intelligence", "bi",
  "dashboards", "reporting", "kpi", "analytics", "data visualization",
  "agile", "scrum", "waterfall", "hipaa", "gdpr", "hl7", "epic", "cerner",
  "claims", "utilization", "healthcare", "revenue cycle", "gap analysis",
  "requirements gathering", "user stories", "process improvement",
  "stakeholder management", "cross-functional", "executive reporting",
  "pyspark", "dax", "power query", "data quality", "data governance",
  "etl pipeline", "automation", "azure synapse", "databricks", "snowflake",
  "root cause analysis", "trend analysis", "variance analysis", "kpi development",
  "population health", "clinical data", "ehr", "phi", "hipaa compliance",
  "data validation", "data cleaning", "data transformation", "data integration",
];

function extractKeywordsSimple(text: string): string[] {
  const lower = text.toLowerCase();
  return TECH_TERMS.filter(term => lower.includes(term));
}

export async function aiOptimizeResume(
  resumeText: string,
  jobDescription: string
): Promise<AIOptimizeResult> {
  const resumeKw = new Set(extractKeywordsSimple(resumeText));
  const jobKw = extractKeywordsSimple(jobDescription);

  const missingKeywords = jobKw.filter(k => !resumeKw.has(k)).slice(0, 25);
  const skillsToHighlight = jobKw.filter(k => resumeKw.has(k)).slice(0, 15);

  const beforeScore = calculateATSScore(resumeText, jobDescription);

  const userMessage = `MASTER RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}

MISSING KEYWORDS — HIGH PRIORITY (integrate naturally wherever truthfully possible):
${missingKeywords.join(", ") || "None identified"}

SKILLS TO HIGHLIGHT (already in resume — make them prominent):
${skillsToHighlight.join(", ") || "None identified"}

IMPORTANT: Try to include as many missing keywords as possible by finding natural placements in Skills, Experience bullets, and Projects. Only skip a keyword if there is truly no honest way to include it.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.4,
    max_tokens: 2500,
  });

  const tailoredResume = response.choices[0]?.message?.content?.trim() ?? "";

  const addedKeywords = missingKeywords.filter(k =>
    tailoredResume.toLowerCase().includes(k.toLowerCase())
  );
  const stillMissingKeywords = missingKeywords.filter(k =>
    !tailoredResume.toLowerCase().includes(k.toLowerCase())
  );

  const afterScore = calculateATSScore(tailoredResume, jobDescription);

  return {
    tailoredResume,
    missingKeywords,
    skillsToHighlight,
    addedKeywords,
    stillMissingKeywords,
    beforeScore,
    afterScore,
  };
}
