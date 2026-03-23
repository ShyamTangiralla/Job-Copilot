const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "as", "is", "was", "are", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "shall", "can", "this", "that", "these", "those", "it", "its",
  "we", "you", "he", "she", "they", "our", "your", "their", "what", "which",
  "who", "when", "where", "why", "how", "not", "no", "so", "yet", "also",
  "than", "then", "there", "here", "any", "all", "each", "both", "more",
  "most", "other", "some", "such", "about", "into", "through", "during",
  "including", "across", "within", "between", "work", "working", "works",
  "experience", "team", "ability", "strong", "new", "well", "high", "large",
  "good", "best", "must", "need", "use", "using", "used", "help",
]);

// Technical tools and languages — matched with whole-phrase boundaries
const TECHNICAL_SKILLS = [
  "sql", "python", "excel", "tableau", "power bi", "powerbi", "looker",
  "dbt", "spark", "pyspark", "hadoop", "aws", "azure", "gcp", "snowflake",
  "databricks", "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch",
  "javascript", "typescript", "react", "node.js", "java", "scala",
  "airflow", "kubernetes", "docker", "git", "jira", "confluence",
  "salesforce", "sap", "oracle", "mysql", "postgresql", "mongodb",
  "redis", "kafka", "elasticsearch", "bigquery", "redshift", "athena",
  "matplotlib", "seaborn", "plotly", "spss", "sas", "stata", "alteryx",
  "qlik", "microstrategy", "ssrs", "ssis", "ssas", "etl", "elt",
  "json", "xml", "linux", "bash", "terraform", "powerpoint", "sharepoint",
  "hipaa", "hl7", "fhir", "epic", "cerner", "icd", "cpt", "meditech",
  "r language", "r programming",
];

// Role-specific keywords — matched as full phrases
const ROLE_KEYWORDS = [
  "data analyst", "business analyst", "healthcare analyst",
  "healthcare data analyst", "data scientist", "data engineer",
  "business intelligence", "analytics", "reporting", "dashboard",
  "visualization", "kpi", "metrics", "insights", "querying",
  "statistical analysis", "predictive modeling", "machine learning",
  "data pipeline", "data warehouse", "data modeling", "data quality",
  "data governance", "data management", "population health",
  "clinical data", "financial analysis", "risk analysis", "forecasting",
  "quality improvement", "revenue cycle",
];

// Domain-specific keywords — matched as full phrases
const DOMAIN_KEYWORDS = [
  "healthcare", "clinical", "medical", "patient", "hospital",
  "ehr", "emr", "phi", "claims", "utilization",
  "finance", "financial", "banking", "investment", "compliance",
  "supply chain", "logistics", "operations",
  "marketing", "customer", "e-commerce", "conversion",
  "stakeholder", "cross-functional", "executive reporting",
  "agile", "scrum", "waterfall", "requirements gathering",
  "process improvement", "gap analysis", "root cause analysis",
  "trend analysis", "variance analysis", "a/b testing",
  "etl pipeline", "data integration", "data transformation",
  "data cleaning", "data validation", "automation",
];

export interface ScoreBreakdown {
  technicalSkillsPct: number;
  roleKeywordsPct: number;
  domainKeywordsPct: number;
  keywordAlignmentPct: number;
  matchedSkills: string[];
  missingSkills: string[];
  matchedRoleKeywords: string[];
  missingRoleKeywords: string[];
}

export interface ATSBreakdown extends ScoreBreakdown {
  atsScore: number;
  resumeName?: string | null;
}

/**
 * Match a phrase against text using whole-word/phrase boundaries.
 * Prevents partial matches (e.g. "r" won't match inside "for").
 */
function phraseMatch(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
  return regex.test(text);
}

function computeBreakdown(resumeText: string, jobText: string): ScoreBreakdown {
  const resume = resumeText.toLowerCase();
  const jd = jobText.toLowerCase();

  // 1. Technical skills (35 pts)
  const jdSkills = TECHNICAL_SKILLS.filter(s => phraseMatch(jd, s));
  const matchedSkills = jdSkills.filter(s => phraseMatch(resume, s));
  const missingSkills = jdSkills.filter(s => !phraseMatch(resume, s));
  const technicalSkillsPct = jdSkills.length > 0
    ? Math.round((matchedSkills.length / jdSkills.length) * 100)
    : 60;

  // 2. Role keywords (25 pts)
  const jdRoleKws = ROLE_KEYWORDS.filter(k => phraseMatch(jd, k));
  const matchedRoleKeywords = jdRoleKws.filter(k => phraseMatch(resume, k));
  const missingRoleKeywords = jdRoleKws.filter(k => !phraseMatch(resume, k));
  const roleKeywordsPct = jdRoleKws.length > 0
    ? Math.round((matchedRoleKeywords.length / jdRoleKws.length) * 100)
    : 60;

  // 3. Domain keywords (20 pts)
  const jdDomainKws = DOMAIN_KEYWORDS.filter(k => phraseMatch(jd, k));
  const matchedDomain = jdDomainKws.filter(k => phraseMatch(resume, k));
  const domainKeywordsPct = jdDomainKws.length > 0
    ? Math.round((matchedDomain.length / jdDomainKws.length) * 100)
    : 60;

  // 4. Keyword/phrase alignment (20 pts)
  // 3+ letter content words from JD that appear in resume
  const jdTokens = (jd.match(/\b[a-z]{3,}\b/g) || []).filter(w => !STOP_WORDS.has(w));
  const jdWordSet = new Set(jdTokens);
  const resumeWordSet = new Set((resume.match(/\b[a-z]{3,}\b/g) || []));
  const jdWordList = [...jdWordSet];
  const matchedWords = jdWordList.filter(w => resumeWordSet.has(w));
  const keywordAlignmentPct = jdWordList.length > 0
    ? Math.round((matchedWords.length / jdWordList.length) * 100)
    : 50;

  return {
    technicalSkillsPct,
    roleKeywordsPct,
    domainKeywordsPct,
    keywordAlignmentPct,
    matchedSkills,
    missingSkills: missingSkills.slice(0, 12),
    matchedRoleKeywords,
    missingRoleKeywords: missingRoleKeywords.slice(0, 10),
  };
}

export function calculateATSBreakdown(resumeText: string, jobDescriptionText: string): ATSBreakdown {
  if (!resumeText || !jobDescriptionText) {
    return {
      atsScore: 0,
      technicalSkillsPct: 0,
      roleKeywordsPct: 0,
      domainKeywordsPct: 0,
      keywordAlignmentPct: 0,
      matchedSkills: [],
      missingSkills: [],
      matchedRoleKeywords: [],
      missingRoleKeywords: [],
    };
  }

  const breakdown = computeBreakdown(resumeText, jobDescriptionText);

  // Weighted formula: tech 35% + role 25% + domain 20% + alignment 20%
  const atsScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        breakdown.technicalSkillsPct * 0.35 +
        breakdown.roleKeywordsPct * 0.25 +
        breakdown.domainKeywordsPct * 0.20 +
        breakdown.keywordAlignmentPct * 0.20
      )
    )
  );

  return { atsScore, ...breakdown };
}

export function calculateATSScore(resumeText: string, jobDescriptionText: string): number {
  return calculateATSBreakdown(resumeText, jobDescriptionText).atsScore;
}
