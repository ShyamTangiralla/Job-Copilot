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
  "good", "best", "must", "need", "use", "using", "used", "help", "help",
]);

const SKILLS = [
  "sql", "python", "r", "excel", "tableau", "power bi", "powerbi", "looker",
  "dbt", "spark", "hadoop", "aws", "azure", "gcp", "snowflake", "databricks",
  "pandas", "numpy", "scikit", "tensorflow", "pytorch", "keras", "javascript",
  "typescript", "react", "node", "java", "scala", "airflow", "kubernetes",
  "docker", "git", "jira", "confluence", "salesforce", "sap", "oracle",
  "mysql", "postgresql", "mongodb", "redis", "kafka", "elasticsearch",
  "bigquery", "redshift", "athena", "matplotlib", "seaborn", "plotly",
  "spss", "sas", "stata", "alteryx", "qlik", "microstrategy", "ssrs",
  "ssis", "ssas", "etl", "json", "xml", "html", "linux", "bash", "terraform",
  "powerpoint", "sharepoint", "hipaa", "hl7", "fhir", "epic", "cerner",
  "icd", "cpt", "claims", "ehr", "emr", "meditech", "allscripts",
];

const ROLE_KEYWORDS = [
  "data analyst", "business analyst", "healthcare analyst",
  "healthcare data analyst", "data scientist", "analytics", "reporting",
  "dashboard", "visualization", "kpi", "metrics", "insights", "querying",
  "analysis", "statistical", "predictive", "machine learning", "bi",
  "pipeline", "warehouse", "modeling", "quality improvement", "population health",
  "clinical data", "financial analysis", "risk analysis", "forecasting",
  "data governance", "data quality", "data management",
];

export interface ATSBreakdown {
  atsScore: number;
  keywordOverlapPct: number;
  skillsOverlapPct: number;
  roleKeywordOverlapPct: number;
  matchedKeywords: string[];
  matchedSkills: string[];
  matchedRoleKeywords: string[];
  missingSkills: string[];
}

export function calculateATSBreakdown(resumeText: string, jobDescriptionText: string): ATSBreakdown {
  if (!resumeText || !jobDescriptionText) {
    return { atsScore: 0, keywordOverlapPct: 0, skillsOverlapPct: 0, roleKeywordOverlapPct: 0, matchedKeywords: [], matchedSkills: [], matchedRoleKeywords: [], missingSkills: [] };
  }

  const resume = resumeText.toLowerCase();
  const jd = jobDescriptionText.toLowerCase();

  const jdTokens = (jd.match(/\b\w{3,}\b/g) || []).filter(w => !STOP_WORDS.has(w));
  const jdWordSet = new Set(jdTokens);
  const resumeWordSet = new Set((resume.match(/\b\w{3,}\b/g) || []));

  const jdKeywordList = [...jdWordSet];
  const matchedKeywords = jdKeywordList.filter(w => resumeWordSet.has(w));
  const keywordOverlapPct = jdKeywordList.length > 0
    ? Math.round((matchedKeywords.length / jdKeywordList.length) * 100)
    : 50;

  const jdSkills = SKILLS.filter(s => jd.includes(s));
  const matchedSkills = jdSkills.filter(s => resume.includes(s));
  const missingSkills = jdSkills.filter(s => !resume.includes(s));
  const skillsOverlapPct = jdSkills.length > 0
    ? Math.round((matchedSkills.length / jdSkills.length) * 100)
    : 50;

  const jdRoleKws = ROLE_KEYWORDS.filter(k => jd.includes(k));
  const matchedRoleKeywords = jdRoleKws.filter(k => resume.includes(k));
  const roleKeywordOverlapPct = jdRoleKws.length > 0
    ? Math.round((matchedRoleKeywords.length / jdRoleKws.length) * 100)
    : 50;

  const keywordScore = jdKeywordList.length > 0 ? (matchedKeywords.length / jdKeywordList.length) * 40 : 20;
  const skillScore = jdSkills.length > 0 ? (matchedSkills.length / jdSkills.length) * 40 : 20;
  const roleScore = jdRoleKws.length > 0 ? (matchedRoleKeywords.length / jdRoleKws.length) * 20 : 10;
  const atsScore = Math.min(100, Math.max(0, Math.round(keywordScore + skillScore + roleScore)));

  return {
    atsScore,
    keywordOverlapPct,
    skillsOverlapPct,
    roleKeywordOverlapPct,
    matchedKeywords: matchedKeywords.slice(0, 20),
    matchedSkills,
    matchedRoleKeywords,
    missingSkills: missingSkills.slice(0, 10),
  };
}

export function calculateATSScore(resumeText: string, jobDescriptionText: string): number {
  if (!resumeText || !jobDescriptionText) return 0;

  const resume = resumeText.toLowerCase();
  const jd = jobDescriptionText.toLowerCase();

  const jdTokens = (jd.match(/\b\w{3,}\b/g) || []).filter(w => !STOP_WORDS.has(w));
  const jdWordSet = new Set(jdTokens);
  const resumeWordSet = new Set((resume.match(/\b\w{3,}\b/g) || []));

  const jdKeywordList = [...jdWordSet];
  const keywordMatchCount = jdKeywordList.filter(w => resumeWordSet.has(w)).length;
  const keywordScore = jdKeywordList.length > 0
    ? (keywordMatchCount / jdKeywordList.length) * 40
    : 20;

  const jdSkills = SKILLS.filter(s => jd.includes(s));
  let skillScore: number;
  if (jdSkills.length > 0) {
    const matchedSkills = jdSkills.filter(s => resume.includes(s));
    skillScore = (matchedSkills.length / jdSkills.length) * 40;
  } else {
    skillScore = 20;
  }

  const jdRoleKws = ROLE_KEYWORDS.filter(k => jd.includes(k));
  let roleScore: number;
  if (jdRoleKws.length > 0) {
    const matched = jdRoleKws.filter(k => resume.includes(k));
    roleScore = (matched.length / jdRoleKws.length) * 20;
  } else {
    roleScore = 10;
  }

  return Math.min(100, Math.max(0, Math.round(keywordScore + skillScore + roleScore)));
}
