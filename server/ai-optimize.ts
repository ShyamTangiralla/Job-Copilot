import OpenAI from "openai";
import { calculateATSBreakdown, type ScoreBreakdown } from "./ats";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FIRST_PASS_PROMPT = `Act as a senior resume writer and hiring manager.

Rewrite and tailor the candidate's resume for the provided job description to make it stronger, more natural, and highly competitive — without sounding generic or AI-generated.

You will be given:
- The candidate's master resume
- The job description
- Missing keywords (high priority — integrate these naturally wherever truthfully supported)
- Skills to highlight (already present — make them prominent)

PASS: TRUTHFUL ONLY
In this pass, only include keywords and phrases that are clearly supported by existing experience, tools, projects, or coursework already present in the resume. Do not invent anything.

Strict rules:

1. Experience Bullet Structure
- Start exactly 3 bullets per role with strong action verbs (Led, Built, Engineered, Designed, Developed, Optimized).
- Start exactly 2 bullets per role with professional neutral verbs (Analyzed, Conducted, Supported, Collaborated, Implemented).
- Each bullet must be 1–1.5 lines maximum. No paragraph bullets.
- Do not repeat the same verb.

2. No Buzzwords
Do NOT use: results-driven, passionate, dynamic, hard-working, go-getter, team player, synergy, leveraging.
Do NOT use: familiarity with, basic knowledge of, exposure to.

3. Authenticity
The resume must read like a real professional wrote it — not a template. Unique, specific, credible.

4. ATS Keyword Integration — TRUTHFUL PASS
- Review each missing keyword against existing experience, tools, projects, and skills in the resume.
- If a keyword fits naturally and is clearly supported by the existing experience, INCLUDE IT.
- Rewrite bullets to naturally incorporate supported missing keywords.
- Update the Skills section with relevant missing skills IF they are evidenced in experience or projects.
- Do not add any skill, tool, or technology not evidenced in the resume.
- Priority order for integration: Skills section > Experience bullets > Project bullets > Summary.

5. Resume Length
- 550–700 words maximum. One page. Concise but detailed.
- Preserve section order and structure from original.

6. Logical Consistency
Skills must match experience. Projects must support technical stack. No tool appears without evidence of usage.

7. Writing Style
Natural. Confident. Professional. No fluff. No exaggeration.

8. Truthfulness
Do not invent companies, roles, achievements, or tools.

Output: Full tailored resume only. No commentary. Clean formatting.`;

const SECOND_PASS_ENRICHMENT_PROMPT = `Act as a senior resume writer and ATS optimization specialist.

A first-pass resume optimization has been completed but the ATS score is still below 80. Your task is to perform a SAFE ENRICHMENT PASS to improve keyword coverage without adding false experience.

You will be given:
- The first-pass optimized resume
- The job description
- Still-missing keywords that could not be integrated in the first pass

PASS: SAFE ENRICHMENT
In this pass, you may extend natural keyword coverage by:
- Adding coursework, certifications, or training that plausibly aligns with the candidate's background
- Mentioning tools as "exposure to X", "working knowledge of X", or "trained in X" ONLY if they relate to existing skills
- Expanding the Skills section with adjacent tools that naturally pair with existing ones
- Strengthening project descriptions to reference domain concepts present in the job description
- Adding a brief "Certifications / Coursework" section if it does not already exist

HARD LIMITS:
- Do NOT invent work history, job titles, or achievements
- Do NOT claim hands-on expertise for tools not evidenced in the resume
- Do NOT add false metrics or numbers
- Every addition must be believable for a candidate with this background
- Keep wording human, specific, and honest

Strict formatting rules:
- Same bullet structure, length, and style as the first-pass resume
- No buzzwords. No weak wording.
- Maintain same section order.
- 550–750 words maximum.

Output: Full enriched resume only. No commentary.`;

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

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return HIGHLIGHT_TERMS.filter(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(lower);
  });
}

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

export async function aiOptimizeResume(
  resumeText: string,
  jobDescription: string
): Promise<AIOptimizeResult> {
  const resumeKws = new Set(extractKeywords(resumeText));
  const jobKws = extractKeywords(jobDescription);

  const missingKeywords = jobKws.filter(k => !resumeKws.has(k));
  const skillsToHighlight = jobKws.filter(k => resumeKws.has(k));

  const beforeScore = calculateATSBreakdown(resumeText, jobDescription).atsScore;

  // --- First pass: truthful only ---
  const firstPassMessage = `MASTER RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nMISSING KEYWORDS — integrate naturally wherever truthfully supported:\n${missingKeywords.join(", ") || "None identified"}\n\nSKILLS TO HIGHLIGHT (already in resume — make them prominent):\n${skillsToHighlight.join(", ") || "None identified"}`;

  const firstPassResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: FIRST_PASS_PROMPT },
      { role: "user", content: firstPassMessage },
    ],
    temperature: 0.35,
    max_tokens: 2500,
  });

  let tailoredResume = firstPassResponse.choices[0]?.message?.content?.trim() ?? "";

  const firstPassBreakdown = calculateATSBreakdown(tailoredResume, jobDescription);
  let usedEnrichmentPass = false;

  // --- Second pass: safe enrichment if score < 80 ---
  if (firstPassBreakdown.atsScore < 80 && tailoredResume.length > 100) {
    const stillMissingAfterFirst = missingKeywords.filter(k => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return !new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(tailoredResume);
    });

    if (stillMissingAfterFirst.length > 0) {
      const secondPassMessage = `FIRST-PASS OPTIMIZED RESUME:\n${tailoredResume}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nSTILL MISSING KEYWORDS (safely integrate where believable — through coursework, training, adjacent tools, or project context):\n${stillMissingAfterFirst.join(", ")}\n\nCurrent ATS score: ${firstPassBreakdown.atsScore}/100. Target: 80+.`;

      try {
        const secondPassResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: SECOND_PASS_ENRICHMENT_PROMPT },
            { role: "user", content: secondPassMessage },
          ],
          temperature: 0.35,
          max_tokens: 2600,
        });

        const enrichedResume = secondPassResponse.choices[0]?.message?.content?.trim() ?? "";
        if (enrichedResume.length > 200) {
          tailoredResume = enrichedResume;
          usedEnrichmentPass = true;
        }
      } catch {
        // If second pass fails, keep first pass result
      }
    }
  }

  const finalBreakdown = calculateATSBreakdown(tailoredResume, jobDescription);
  const afterScore = finalBreakdown.atsScore;

  const addedKeywords = missingKeywords.filter(k => {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(tailoredResume);
  });

  const stillMissingKeywords = missingKeywords.filter(k => {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(tailoredResume);
  });

  return {
    tailoredResume,
    missingKeywords,
    skillsToHighlight,
    addedKeywords,
    stillMissingKeywords,
    beforeScore,
    afterScore,
    afterScoreBreakdown: {
      technicalSkillsPct: finalBreakdown.technicalSkillsPct,
      roleKeywordsPct: finalBreakdown.roleKeywordsPct,
      domainKeywordsPct: finalBreakdown.domainKeywordsPct,
      keywordAlignmentPct: finalBreakdown.keywordAlignmentPct,
      matchedSkills: finalBreakdown.matchedSkills,
      missingSkills: finalBreakdown.missingSkills,
      matchedRoleKeywords: finalBreakdown.matchedRoleKeywords,
      missingRoleKeywords: finalBreakdown.missingRoleKeywords,
    },
    usedEnrichmentPass,
  };
}
