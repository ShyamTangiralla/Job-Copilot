const ROLE_KEYWORD_PROFILES: Record<string, string[]> = {
  "Data Analyst": [
    "sql", "python", "tableau", "power bi", "excel", "data visualization",
    "dashboards", "reporting", "analytics", "kpi", "etl", "data warehousing",
    "statistical analysis", "data modeling", "business intelligence", "bi",
    "data mining", "trend analysis", "ad hoc", "pivot tables", "vlookup",
    "google sheets", "looker", "qlik", "sas", "r programming", "jupyter",
    "data cleaning", "data quality", "metrics", "stakeholder",
  ],
  "Healthcare Data Analyst": [
    "sql", "python", "tableau", "power bi", "excel", "data visualization",
    "dashboards", "reporting", "analytics", "kpi", "etl",
    "claims analytics", "utilization", "healthcare kpis", "compliance",
    "regulatory reporting", "ehr", "emr", "epic", "cerner", "hipaa",
    "clinical data", "patient outcomes", "population health", "icd-10",
    "cpt codes", "revenue cycle", "medical coding", "healthcare",
    "quality measures", "hedis", "cms", "medicaid", "medicare",
  ],
  "Business Analyst": [
    "sql", "excel", "tableau", "power bi", "jira", "confluence",
    "requirements gathering", "stakeholder collaboration", "process improvement",
    "documentation", "user stories", "acceptance criteria", "uml",
    "business process", "gap analysis", "workflows", "agile", "scrum",
    "data analysis", "reporting", "project management", "use cases",
    "functional requirements", "sop", "business requirements",
  ],
  "Financial Analyst": [
    "sql", "excel", "python", "tableau", "power bi",
    "forecasting", "variance analysis", "budgeting", "financial reporting",
    "financial modeling", "p&l", "revenue", "cost analysis", "roi",
    "cash flow", "balance sheet", "income statement", "gaap",
    "quickbooks", "sap", "oracle financials", "month-end close",
  ],
};

const COMMON_TECHNICAL_KEYWORDS = [
  "sql", "python", "r", "tableau", "power bi", "excel", "google sheets",
  "looker", "qlik", "sas", "spss", "jupyter", "pandas", "numpy",
  "matplotlib", "seaborn", "scikit-learn", "tensorflow",
  "aws", "azure", "gcp", "snowflake", "redshift", "bigquery",
  "postgresql", "mysql", "mongodb", "oracle", "sql server",
  "etl", "data pipeline", "airflow", "dbt", "spark",
  "git", "github", "jira", "confluence", "slack", "teams",
  "agile", "scrum", "kanban", "waterfall",
  "html", "css", "javascript", "react", "node.js",
  "api", "rest", "json", "xml", "csv",
];

const BUSINESS_KEYWORDS = [
  "stakeholder", "cross-functional", "executive", "leadership",
  "strategy", "optimization", "efficiency", "revenue", "cost reduction",
  "roi", "kpi", "metrics", "performance", "benchmark",
  "requirements", "documentation", "presentation", "communication",
  "collaboration", "project management", "deadline", "deliverables",
  "client", "customer", "vendor", "partner",
];

const ACTION_VERBS_STRONG = [
  "led", "built", "designed", "developed", "engineered", "optimized",
  "architected", "established", "pioneered", "spearheaded", "transformed",
  "launched", "created", "drove", "delivered", "streamlined",
];

const ACTION_VERBS_NEUTRAL = [
  "analyzed", "conducted", "supported", "collaborated", "managed",
  "implemented", "maintained", "coordinated", "evaluated", "assessed",
  "documented", "monitored", "tracked", "prepared", "reviewed",
  "processed", "facilitated", "administered",
];

function extractKeywords(text: string): Set<string> {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  const allKeywords = [
    ...COMMON_TECHNICAL_KEYWORDS,
    ...BUSINESS_KEYWORDS,
    ...Object.values(ROLE_KEYWORD_PROFILES).flat(),
  ];

  const unique = [...new Set(allKeywords)];

  for (const kw of unique) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(lower)) {
      found.add(kw.toLowerCase());
    }
  }

  return found;
}

function extractNGrams(text: string, n: number): string[] {
  const words = text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
  const ngrams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(" "));
  }
  return ngrams;
}

function computeATSScore(resumeText: string, jobDescription: string): number {
  const jobKw = extractKeywords(jobDescription);
  const resumeKw = extractKeywords(resumeText);

  if (jobKw.size === 0) return 0;

  let matched = 0;
  for (const kw of jobKw) {
    if (resumeKw.has(kw)) matched++;
  }

  const keywordScore = (matched / jobKw.size) * 70;

  const jobBigrams = new Set(extractNGrams(jobDescription, 2));
  const resumeBigrams = new Set(extractNGrams(resumeText, 2));
  let bigramMatched = 0;
  for (const bg of jobBigrams) {
    if (resumeBigrams.has(bg)) bigramMatched++;
  }
  const bigramScore = jobBigrams.size > 0 ? (bigramMatched / jobBigrams.size) * 30 : 0;

  return Math.min(100, Math.round(keywordScore + bigramScore));
}

export interface KeywordAnalysis {
  jobKeywords: string[];
  resumeKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  weakKeywords: string[];
}

export interface Improvement {
  section: string;
  oldLine: string;
  newLine: string;
  reason: string;
}

export interface TailoringResult {
  keywordAnalysis: KeywordAnalysis;
  improvements: Improvement[];
  tailoredText: string;
  matchBefore: number;
  matchAfter: number;
  improvementSummary: string;
}

function identifyWeakPhrases(resumeText: string): string[] {
  const weakPatterns = [
    "familiarity with",
    "basic knowledge of",
    "exposure to",
    "some experience with",
    "limited experience",
    "beginner",
    "introductory",
    "learning",
    "familiar with",
  ];
  const found: string[] = [];
  const lower = resumeText.toLowerCase();
  for (const pattern of weakPatterns) {
    if (lower.includes(pattern)) {
      found.push(pattern);
    }
  }
  return found;
}

function parseResumeIntoSections(text: string): { name: string; content: string; startIdx: number; endIdx: number }[] {
  const sectionHeaders = [
    "summary", "objective", "professional summary", "career summary",
    "experience", "work experience", "professional experience", "employment",
    "education", "academic", "certifications", "certificates",
    "skills", "technical skills", "core competencies", "competencies",
    "projects", "achievements", "awards", "publications",
    "volunteer", "leadership", "activities",
  ];

  const lines = text.split("\n");
  const sections: { name: string; content: string; startIdx: number; endIdx: number }[] = [];
  let currentSection = "header";
  let currentStart = 0;
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim().toLowerCase().replace(/[:\-_|]/g, "").trim();
    const matchedHeader = sectionHeaders.find(h => trimmed === h || trimmed.startsWith(h));

    if (matchedHeader && lines[i].trim().length < 50) {
      if (currentLines.length > 0) {
        sections.push({
          name: currentSection,
          content: currentLines.join("\n"),
          startIdx: currentStart,
          endIdx: i - 1,
        });
      }
      currentSection = matchedHeader;
      currentStart = i;
      currentLines = [lines[i]];
    } else {
      currentLines.push(lines[i]);
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      name: currentSection,
      content: currentLines.join("\n"),
      startIdx: currentStart,
      endIdx: lines.length - 1,
    });
  }

  return sections;
}

function getRoleKeywords(roleClassification: string): string[] {
  for (const [role, keywords] of Object.entries(ROLE_KEYWORD_PROFILES)) {
    if (roleClassification.toLowerCase().includes(role.toLowerCase())) {
      return keywords;
    }
  }
  return ROLE_KEYWORD_PROFILES["Data Analyst"] || [];
}

function suggestBulletImprovement(
  bullet: string,
  missingKeywords: string[],
  section: string
): { newLine: string; reason: string; keywordsAdded: string[] } | null {
  const lower = bullet.toLowerCase();
  const keywordsAdded: string[] = [];
  let improved = bullet;

  for (const kw of missingKeywords) {
    if (keywordsAdded.length >= 2) break;

    const kwLower = kw.toLowerCase();
    if (lower.includes(kwLower)) continue;

    const relatedContexts: Record<string, string[]> = {
      "sql": ["data", "database", "query", "queries", "extract", "report"],
      "python": ["automat", "script", "analysis", "data processing", "tool"],
      "tableau": ["visual", "dashboard", "report", "chart", "metric"],
      "power bi": ["visual", "dashboard", "report", "chart", "metric", "bi"],
      "excel": ["spreadsheet", "data", "analysis", "report", "track"],
      "dashboards": ["report", "visual", "metric", "kpi", "monitor", "track"],
      "reporting": ["data", "analysis", "metric", "kpi", "stakeholder", "present"],
      "analytics": ["data", "insight", "trend", "pattern", "analysis"],
      "kpi": ["metric", "performance", "target", "goal", "measure", "track"],
      "etl": ["data", "pipeline", "extract", "transform", "load", "process"],
      "stakeholder": ["present", "communicat", "collaborat", "report", "cross"],
      "compliance": ["regulat", "policy", "standard", "audit", "ensure"],
      "documentation": ["document", "process", "procedure", "standard", "record"],
      "requirements": ["gather", "business", "stakeholder", "document", "analyz"],
      "data visualization": ["chart", "graph", "visual", "dashboard", "present"],
      "healthcare": ["patient", "clinical", "medical", "health", "care"],
      "claims analytics": ["claim", "process", "analyz", "data"],
      "forecasting": ["predict", "project", "trend", "estimat", "plan"],
    };

    const contexts = relatedContexts[kwLower] || [];
    const hasContext = contexts.length === 0 || contexts.some(c => lower.includes(c));

    if (hasContext) {
      if (section === "skills" || section === "technical skills" || section === "core competencies") {
        const properKw = kw.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        if (improved.endsWith(",") || improved.endsWith(", ")) {
          improved = improved.trimEnd();
          if (!improved.endsWith(",")) improved += ",";
          improved += ` ${properKw},`;
        } else {
          improved = improved.trimEnd();
          if (improved.length > 0) improved += `, ${properKw}`;
        }
        keywordsAdded.push(kw);
      } else {
        const properKw = kw.charAt(0).toUpperCase() + kw.slice(1);
        if (lower.includes("using") || lower.includes("with") || lower.includes("leveraging")) {
          const insertPoint = improved.search(/using|with|leveraging/i);
          if (insertPoint !== -1) {
            const after = improved.substring(insertPoint);
            const afterMatch = after.match(/^(using|with|leveraging)\s+/i);
            if (afterMatch) {
              const pos = insertPoint + afterMatch[0].length;
              const rest = improved.substring(pos);
              if (!rest.toLowerCase().startsWith(kwLower)) {
                improved = improved.substring(0, pos) + properKw + ", " + rest;
                keywordsAdded.push(kw);
              }
            }
          }
        } else if (improved.trimEnd().endsWith(".")) {
          improved = improved.trimEnd().slice(0, -1) + ` using ${properKw}.`;
          keywordsAdded.push(kw);
        }
      }
    }
  }

  if (keywordsAdded.length === 0) {
    const weakPatterns = [
      { pattern: /familiarity with/gi, replacement: "proficiency in" },
      { pattern: /basic knowledge of/gi, replacement: "working knowledge of" },
      { pattern: /exposure to/gi, replacement: "experience with" },
      { pattern: /some experience with/gi, replacement: "hands-on experience with" },
      { pattern: /helped with/gi, replacement: "contributed to" },
      { pattern: /assisted in/gi, replacement: "supported" },
      { pattern: /responsible for/gi, replacement: "managed" },
      { pattern: /worked on/gi, replacement: "contributed to" },
    ];

    let changed = false;
    for (const { pattern, replacement } of weakPatterns) {
      if (pattern.test(improved)) {
        improved = improved.replace(pattern, replacement);
        changed = true;
      }
    }

    if (!changed) return null;
    return { newLine: improved, reason: "Strengthened weak wording", keywordsAdded: [] };
  }

  return {
    newLine: improved,
    reason: `Integrated keyword${keywordsAdded.length > 1 ? "s" : ""}: ${keywordsAdded.join(", ")}`,
    keywordsAdded,
  };
}

export function analyzeAndTailor(
  resumeText: string,
  jobDescription: string,
  roleClassification: string
): TailoringResult {
  const jobKeywordsSet = extractKeywords(jobDescription);
  const resumeKeywordsSet = extractKeywords(resumeText);

  const roleKw = getRoleKeywords(roleClassification);
  for (const kw of roleKw) {
    const lower = kw.toLowerCase();
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(jobDescription.toLowerCase())) {
      jobKeywordsSet.add(lower);
    }
  }

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];
  for (const kw of jobKeywordsSet) {
    if (resumeKeywordsSet.has(kw)) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  }

  const weakPhrases = identifyWeakPhrases(resumeText);
  const weakKeywords = weakPhrases;

  const priorityOrder = [
    ...roleKw.filter(k => missingKeywords.includes(k.toLowerCase())),
    ...missingKeywords.filter(k => !roleKw.map(r => r.toLowerCase()).includes(k)),
  ];
  const uniquePrioritized = [...new Set(priorityOrder.map(k => k.toLowerCase()))];

  const keywordAnalysis: KeywordAnalysis = {
    jobKeywords: [...jobKeywordsSet].sort(),
    resumeKeywords: [...resumeKeywordsSet].sort(),
    matchedKeywords: matchedKeywords.sort(),
    missingKeywords: uniquePrioritized,
    weakKeywords,
  };

  const matchBefore = computeATSScore(resumeText, jobDescription);

  const sections = parseResumeIntoSections(resumeText);
  const improvements: Improvement[] = [];
  const lines = resumeText.split("\n");
  const modifiedLines = [...lines];
  const addedKeywords = new Set<string>();

  for (const section of sections) {
    if (!["experience", "work experience", "professional experience", "employment",
         "skills", "technical skills", "core competencies", "competencies",
         "projects", "summary", "professional summary"].includes(section.name)) {
      continue;
    }

    const sectionLines = lines.slice(section.startIdx, section.endIdx + 1);
    for (let i = 0; i < sectionLines.length; i++) {
      const remainingMissing = uniquePrioritized.filter(k => !addedKeywords.has(k));
      const lineIdx = section.startIdx + i;
      const line = sectionLines[i];
      if (line.trim().length < 10) continue;

      const result = suggestBulletImprovement(line, remainingMissing, section.name);
      if (result) {
        improvements.push({
          section: section.name,
          oldLine: line.trim(),
          newLine: result.newLine.trim(),
          reason: result.reason,
        });
        modifiedLines[lineIdx] = result.newLine;
        for (const kw of result.keywordsAdded) {
          addedKeywords.add(kw);
        }
      }
    }
  }

  const tailoredText = modifiedLines.join("\n");
  const matchAfter = computeATSScore(tailoredText, jobDescription);

  const addedCount = addedKeywords.size;
  const weakFixed = improvements.filter(i => i.reason.includes("Strengthened")).length;
  const parts: string[] = [];
  if (addedCount > 0) parts.push(`Integrated ${addedCount} missing keyword${addedCount > 1 ? "s" : ""}`);
  if (weakFixed > 0) parts.push(`Strengthened ${weakFixed} weak phrase${weakFixed > 1 ? "s" : ""}`);
  if (matchAfter > matchBefore) parts.push(`ATS match improved from ${matchBefore}% to ${matchAfter}%`);
  else if (matchBefore > 0) parts.push(`ATS match: ${matchBefore}%`);
  const improvementSummary = parts.join(". ") || "No significant changes needed — resume already well-aligned.";

  return {
    keywordAnalysis,
    improvements,
    tailoredText,
    matchBefore,
    matchAfter,
    improvementSummary,
  };
}
