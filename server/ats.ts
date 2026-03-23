// ─── Stop words ───────────────────────────────────────────────────────────────
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
  "good", "best", "must", "need", "use", "using", "used", "help", "make",
  "provide", "support", "ensure", "enable", "manage", "develop", "create",
  "build", "maintain", "perform", "apply", "identify", "understand", "based",
  "related", "required", "preferred", "desired", "level", "years", "year",
  "plus", "per", "time", "full", "part", "key", "role", "position",
]);

// ─── Keyword lists for category scoring ───────────────────────────────────────
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

// High-value verbs/nouns that signal phrase alignment
const ALIGNMENT_SIGNAL_WORDS = new Set([
  "forecast", "forecastin", "model", "modelin", "plan", "plannin",
  "analyz", "analys", "report", "reportin", "automat", "optimiz",
  "transform", "integrat", "validat", "monitor", "segment", "predict",
  "classif", "regress", "cluster", "visualiz", "dashboard", "pipeline",
  "insight", "metric", "kpi", "benchmark", "stakeholder", "recommend",
  "implement", "design", "architect", "streamlin", "standardiz",
  "govern", "qualit", "complian", "audit", "reconcil",
]);

// ─── Public interfaces ─────────────────────────────────────────────────────────
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

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Whole-phrase boundary match (prevents "r" matching inside "for"). */
function phraseMatch(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(text);
}

/**
 * Minimal suffix-based lemmatizer.
 * Reduces inflected forms to approximate stems for better overlap detection.
 */
function lemmatize(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith("tion") || word.endsWith("sion")) return word.slice(0, -3); // "tion→t"
  if (word.endsWith("ment")) return word.slice(0, -4);
  if (word.endsWith("ness")) return word.slice(0, -4);
  if (word.endsWith("ings")) return word.slice(0, -4);
  if (word.endsWith("ing") && word.length > 6) return word.slice(0, -3);
  if (word.endsWith("tion")) return word.slice(0, -4);
  if (word.endsWith("ied")) return word.slice(0, -3) + "y";
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ves")) return word.slice(0, -3) + "f";
  if (word.endsWith("ed") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("er") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("est") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ly") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 4) return word.slice(0, -1);
  return word;
}

/** Tokenize text: lowercase words ≥3 chars, stopwords removed, lemmatized. */
function tokenize(text: string): string[] {
  const raw = (text.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);
  return raw
    .filter(w => !STOP_WORDS.has(w))
    .map(lemmatize);
}

/** Extract bigrams from a token list. */
function bigrams(tokens: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    result.push(`${tokens[i]}|${tokens[i + 1]}`);
  }
  return result;
}

/** Extract trigrams from a token list. */
function trigrams(tokens: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < tokens.length - 2; i++) {
    result.push(`${tokens[i]}|${tokens[i + 1]}|${tokens[i + 2]}`);
  }
  return result;
}

/** Jaccard similarity between two sets. */
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  sa.forEach(t => { if (sb.has(t)) inter++; });
  const union = sa.size + sb.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Cosine similarity using term-frequency vectors.
 * Uses lemmatized unigrams as the vocabulary.
 */
function cosineSim(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  // Build TF maps
  const tfA: Record<string, number> = {};
  const tfB: Record<string, number> = {};
  for (const t of a) tfA[t] = (tfA[t] ?? 0) + 1;
  for (const t of b) tfB[t] = (tfB[t] ?? 0) + 1;

  // Dot product over shared terms
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const t of Object.keys(tfA)) {
    magA += tfA[t] ** 2;
    if (tfB[t]) dot += tfA[t] * tfB[t];
  }
  for (const t of Object.keys(tfB)) magB += tfB[t] ** 2;

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Split text into sentences. Handles period/exclamation/question marks,
 * newlines, and semicolons. Returns only non-trivial sentences (≥5 tokens).
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 30);
}

/**
 * Split resume text into bullets / meaningful lines.
 * Includes any line with ≥4 words that isn't purely a section header.
 */
function splitBullets(text: string): string[] {
  return text
    .split(/\n/)
    .map(l => l.replace(/^[-•*▪▸◆‣·\s]+/, "").trim())
    .filter(l => {
      if (l.length < 25) return false;
      // Skip all-caps section headers (e.g. "EXPERIENCE", "EDUCATION")
      if (/^[A-Z\s/&]+$/.test(l)) return false;
      return true;
    });
}

/**
 * Compute phrase-level alignment score between a resume bullet and a JD sentence.
 * Returns a value in [0, 1].
 *
 * Weights:
 *   - Unigram Jaccard    35%  — shared lemmatized content words
 *   - Bigram overlap     25%  — shared two-word phrases
 *   - Trigram overlap    10%  — shared three-word phrases (bonus for exact phrases)
 *   - Cosine similarity  30%  — frequency-weighted full vector similarity
 */
function bulletSentenceScore(bulletToks: string[], sentToks: string[]): number {
  if (bulletToks.length === 0 || sentToks.length === 0) return 0;

  const uniJ = jaccard(bulletToks, sentToks);

  const bBig = bigrams(bulletToks);
  const sBig = bigrams(sentToks);
  const biJ = jaccard(bBig, sBig);

  const bTri = trigrams(bulletToks);
  const sTri = trigrams(sentToks);
  const triJ = jaccard(bTri, sTri);

  const cos = cosineSim(bulletToks, sentToks);

  return 0.35 * uniJ + 0.25 * biJ + 0.10 * triJ + 0.30 * cos;
}

/**
 * Signal word bonus: fraction of alignment signal words present in both texts.
 * Range: [0, 1]
 */
function signalWordBonus(resumeToks: string[], jdToks: string[]): number {
  const rSet = new Set(resumeToks);
  const jSet = new Set(jdToks);
  let shared = 0;
  let total = 0;
  ALIGNMENT_SIGNAL_WORDS.forEach(sw => {
    // Check prefix match against both sets (stems vary)
    const inJd = jdToks.some(t => t.startsWith(sw) || sw.startsWith(t));
    if (inJd) {
      total++;
      if (resumeToks.some(t => t.startsWith(sw) || sw.startsWith(t))) shared++;
    }
  });
  return total > 0 ? shared / total : 0;
}

/**
 * Full phrase-alignment scoring engine.
 *
 * Algorithm:
 *   1. Split JD into sentences; split resume into bullet lines.
 *   2. Tokenize each with lemmatization + stopword removal.
 *   3. For each resume bullet, compute match score against every JD sentence.
 *      Take the BEST match (each bullet finds its closest JD sentence).
 *   4. Average the per-bullet best scores.
 *   5. Apply a signal-word bonus and a word-overlap floor.
 *   6. Scale and clamp to [0, 100].
 *
 * Returns an integer percentage [0, 100].
 */
function computePhraseAlignment(resumeText: string, jdText: string): number {
  const sentences = splitSentences(jdText);
  const bullets = splitBullets(resumeText);

  // Fallback: simple word overlap if either side is too sparse
  const jdAllToks = tokenize(jdText);
  const resumeAllToks = tokenize(resumeText);

  const simpleOverlap = (() => {
    const jdSet = new Set(jdAllToks);
    const resSet = new Set(resumeAllToks);
    const matched = [...jdSet].filter(w => resSet.has(w)).length;
    return jdSet.size > 0 ? matched / jdSet.size : 0;
  })();

  if (sentences.length === 0 || bullets.length === 0) {
    return Math.min(100, Math.round(simpleOverlap * 130));
  }

  // Tokenize sentences + bullets
  const sentToks = sentences.map(tokenize);
  const bulletToks = bullets.map(tokenize);

  // For each bullet, find best-matching JD sentence
  let totalBestScore = 0;
  let activeBullets = 0;

  for (const btoks of bulletToks) {
    if (btoks.length < 2) continue;    // skip near-empty lines
    let best = 0;
    for (const stoks of sentToks) {
      if (stoks.length < 2) continue;
      const s = bulletSentenceScore(btoks, stoks);
      if (s > best) best = s;
    }
    totalBestScore += best;
    activeBullets++;
  }

  const avgBulletScore = activeBullets > 0 ? totalBestScore / activeBullets : 0;

  // Signal-word bonus: shared high-value action words
  const swBonus = signalWordBonus(resumeAllToks, jdAllToks);

  // Combined: 60% phrase alignment, 25% simple overlap, 15% signal words
  const combined = 0.60 * avgBulletScore + 0.25 * simpleOverlap + 0.15 * swBonus;

  // Calibration: a strong resume scores ~0.28–0.35 combined → maps to 75–90%
  // Scale factor 260 maps 0.30 → 78, 0.35 → 91, 0.20 → 52
  const scaled = Math.min(100, Math.round(combined * 260));

  // Floor: never go below the simple overlap score (no regression)
  const floor = Math.min(100, Math.round(simpleOverlap * 110));

  return Math.max(floor, scaled);
}

// ─── Main breakdown computation ───────────────────────────────────────────────

function computeBreakdown(resumeText: string, jobText: string): ScoreBreakdown {
  const resume = resumeText.toLowerCase();
  const jd = jobText.toLowerCase();

  // 1. Technical skills — 35% weight
  const jdSkills = TECHNICAL_SKILLS.filter(s => phraseMatch(jd, s));
  const matchedSkills = jdSkills.filter(s => phraseMatch(resume, s));
  const missingSkills = jdSkills.filter(s => !phraseMatch(resume, s));
  const technicalSkillsPct = jdSkills.length > 0
    ? Math.round((matchedSkills.length / jdSkills.length) * 100)
    : 60;

  // 2. Role keywords — 25% weight
  const jdRoleKws = ROLE_KEYWORDS.filter(k => phraseMatch(jd, k));
  const matchedRoleKeywords = jdRoleKws.filter(k => phraseMatch(resume, k));
  const missingRoleKeywords = jdRoleKws.filter(k => !phraseMatch(resume, k));
  const roleKeywordsPct = jdRoleKws.length > 0
    ? Math.round((matchedRoleKeywords.length / jdRoleKws.length) * 100)
    : 60;

  // 3. Domain keywords — 20% weight
  const jdDomainKws = DOMAIN_KEYWORDS.filter(k => phraseMatch(jd, k));
  const matchedDomain = jdDomainKws.filter(k => phraseMatch(resume, k));
  const domainKeywordsPct = jdDomainKws.length > 0
    ? Math.round((matchedDomain.length / jdDomainKws.length) * 100)
    : 60;

  // 4. Keyword/phrase alignment — 20% weight (new engine)
  const keywordAlignmentPct = computePhraseAlignment(resumeText, jobText);

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

// ─── Public API ───────────────────────────────────────────────────────────────

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
        breakdown.roleKeywordsPct    * 0.25 +
        breakdown.domainKeywordsPct  * 0.20 +
        breakdown.keywordAlignmentPct * 0.20
      )
    )
  );

  return { atsScore, ...breakdown };
}

export function calculateATSScore(resumeText: string, jobDescriptionText: string): number {
  return calculateATSBreakdown(resumeText, jobDescriptionText).atsScore;
}
