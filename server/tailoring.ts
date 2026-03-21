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

const DATE_PATTERNS = [
  /\d{1,2}\/\d{4}\s*[–\-—]\s*\d{1,2}\/\d{4}/,
  /\d{1,2}\/\d{4}\s*[–\-—]\s*(present|current)/i,
  /\d{4}\s*[–\-—]\s*\d{4}/,
  /\d{4}\s*[–\-—]\s*(present|current)/i,
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\s*[–\-—]/i,
  /[–\-—]\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}/i,
  /^\s*\d{1,2}\/\d{2,4}\s*$/,
];

function isDateLine(line: string): boolean {
  const trimmed = line.trim();
  for (const pattern of DATE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

function isProtectedLine(line: string, sectionName: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  if (isDateLine(line)) return true;
  if (trimmed.length < 10) return true;

  const sectionHeaders = [
    "summary", "objective", "professional summary", "career summary",
    "experience", "work experience", "professional experience", "employment",
    "education", "academic", "certifications", "certificates",
    "skills", "technical skills", "core competencies", "competencies",
    "projects", "achievements", "awards", "publications",
    "volunteer", "leadership", "activities",
  ];
  const lowerTrimmed = trimmed.toLowerCase().replace(/[:\-_|]/g, "").trim();
  if (sectionHeaders.some(h => lowerTrimmed === h || (lowerTrimmed.startsWith(h) && trimmed.length < 50))) {
    return true;
  }

  const isBullet = /^[\-•▪▸►◦\*]\s/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed);
  const isSkillsSection = ["skills", "technical skills", "core competencies", "competencies"].includes(sectionName);
  const isExperienceSection = ["experience", "work experience", "professional experience", "employment"].includes(sectionName);
  const isProjectsSection = sectionName === "projects";

  if (isSkillsSection) {
    if (trimmed.includes(",") || trimmed.includes("|") || trimmed.includes(":")) return false;
    if (isBullet) return false;
    return true;
  }

  if (isExperienceSection || isProjectsSection) {
    if (isBullet) return false;
    return true;
  }

  return true;
}

const LOCKED_SECTIONS = [
  "education", "academic", "certifications", "certificates", "header",
  "achievements", "awards", "publications", "volunteer", "leadership", "activities",
];

const EDITABLE_SECTIONS = [
  "experience", "work experience", "professional experience", "employment",
  "skills", "technical skills", "core competencies", "competencies",
  "projects", "summary", "professional summary",
];

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
    if (LOCKED_SECTIONS.includes(section.name)) continue;
    if (!EDITABLE_SECTIONS.includes(section.name)) continue;

    const sectionLines = lines.slice(section.startIdx, section.endIdx + 1);
    for (let i = 0; i < sectionLines.length; i++) {
      const remainingMissing = uniquePrioritized.filter(k => !addedKeywords.has(k));
      const lineIdx = section.startIdx + i;
      const line = sectionLines[i];

      if (isProtectedLine(line, section.name)) continue;

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

export interface OptimizeResult {
  missingKeywords: string[];
  improvedSummary: string;
  improvedBullets: { original: string; improved: string; reason: string }[];
  skillsToHighlight: string[];
}

export function optimizeResume(resumeText: string, jobDescription: string): OptimizeResult {
  const jobKw = extractKeywords(jobDescription);
  const resumeKw = extractKeywords(resumeText);

  const missingKeywords = [...jobKw].filter(k => !resumeKw.has(k)).slice(0, 20);
  const skillsToHighlight = [...jobKw].filter(k => resumeKw.has(k) && COMMON_TECHNICAL_KEYWORDS.includes(k)).slice(0, 15);

  const sections = parseResumeIntoSections(resumeText);

  const summarySection = sections.find(s =>
    ["summary", "objective", "professional summary", "career summary"].includes(s.name)
  );
  const existingSummary = summarySection?.content
    ? summarySection.content.split("\n").filter(l => l.trim().length > 10 && !l.toLowerCase().includes("summary")).join(" ").trim()
    : "";

  const topJobKw = [...jobKw].slice(0, 8).map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(", ");
  const topMatchedTech = skillsToHighlight.slice(0, 5).map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(", ");
  const topMissing = missingKeywords.slice(0, 3).map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(", ");

  let improvedSummary: string;
  if (existingSummary.length > 30) {
    let s = existingSummary;
    const weakReplacements: [RegExp, string][] = [
      [/responsible for/gi, "managed"],
      [/helped with/gi, "contributed to"],
      [/assisted in/gi, "supported"],
      [/worked on/gi, "contributed to"],
      [/familiar with/gi, "experienced with"],
      [/exposure to/gi, "hands-on experience with"],
    ];
    for (const [pattern, replacement] of weakReplacements) {
      s = s.replace(pattern, replacement);
    }
    if (topMissing && !s.toLowerCase().includes(missingKeywords[0])) {
      s = s.replace(/\.\s*$/, "") + `. Seeking to leverage expertise in ${topMissing} to deliver measurable impact.`;
    }
    improvedSummary = s;
  } else {
    const techStr = topMatchedTech ? ` with proficiency in ${topMatchedTech}` : "";
    const missingStr = topMissing ? ` Seeking to apply knowledge of ${topMissing}.` : "";
    improvedSummary = `Results-driven professional${techStr}. Demonstrated ability to analyze complex data, deliver actionable insights, and collaborate with cross-functional teams to achieve business objectives.${missingStr}`;
  }

  const expSection = sections.find(s =>
    ["experience", "work experience", "professional experience", "employment"].includes(s.name)
  );

  const improvedBullets: { original: string; improved: string; reason: string }[] = [];

  if (expSection) {
    const lines = expSection.content.split("\n");
    for (const line of lines) {
      if (improvedBullets.length >= 5) break;
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 20) continue;
      const isBullet = /^[\-•▪▸►◦\*]\s/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed);
      if (!isBullet) continue;

      const result = suggestBulletImprovement(trimmed, missingKeywords, "experience");
      if (result) {
        improvedBullets.push({
          original: trimmed,
          improved: result.newLine,
          reason: result.reason,
        });
      }
    }
  }

  return {
    missingKeywords,
    improvedSummary,
    improvedBullets,
    skillsToHighlight,
  };
}
