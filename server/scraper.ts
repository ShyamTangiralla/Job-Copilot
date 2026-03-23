import * as cheerio from "cheerio";
import { URL } from "url";

function validateUrl(urlString: string): string {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  const hostname = parsed.hostname.toLowerCase();
  const blockedPatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^0\./,
    /^169\.254\./,
    /^\[::1\]$/,
    /^\[fe80:/i,
    /^\[fc/i,
    /^\[fd/i,
    /\.local$/i,
    /\.internal$/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(hostname)) {
      throw new Error("URLs pointing to internal/private networks are not allowed");
    }
  }

  return parsed.toString();
}

interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  workMode: string;
  datePosted: string;
  description: string;
  source: string;
  applyLink: string;
}

function detectSource(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("linkedin.com")) return "LinkedIn";
  if (lower.includes("indeed.com")) return "Indeed";
  if (lower.includes("glassdoor.com")) return "Glassdoor";
  if (lower.includes("ziprecruiter.com")) return "ZipRecruiter";
  if (lower.includes("monster.com")) return "Monster";
  if (lower.includes("dice.com")) return "Dice";
  if (lower.includes("lever.co")) return "Lever";
  if (lower.includes("greenhouse.io")) return "Greenhouse";
  if (lower.includes("workday.com")) return "Workday";
  if (lower.includes("icims.com")) return "iCIMS";
  if (lower.includes("smartrecruiters.com")) return "SmartRecruiters";
  if (lower.includes("myworkdayjobs.com")) return "Workday";
  return "Company Website";
}

function detectWorkMode(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("remote") && lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("fully remote") || lower.includes("100% remote")) return "Remote";
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  if (lower.includes("on-site") || lower.includes("onsite") || lower.includes("in-office")) return "Onsite";
  return "Remote";
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function scrapeJobFromUrl(url: string): Promise<ScrapedJob> {
  const validatedUrl = validateUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(validatedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  let title = "";
  let company = "";
  let location = "";
  let description = "";
  let datePosted = "";

  const jsonLdScripts = $('script[type="application/ld+json"]');
  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "{}");
      const jobData = data["@type"] === "JobPosting" ? data : (Array.isArray(data["@graph"]) ? data["@graph"].find((d: any) => d["@type"] === "JobPosting") : null);
      if (jobData) {
        title = title || jobData.title || "";
        company = company || (typeof jobData.hiringOrganization === "object" ? jobData.hiringOrganization?.name : jobData.hiringOrganization) || "";
        description = description || (jobData.description ? cleanText(cheerio.load(jobData.description).text()) : "");
        datePosted = datePosted || jobData.datePosted || "";
        if (jobData.jobLocation) {
          const loc = Array.isArray(jobData.jobLocation) ? jobData.jobLocation[0] : jobData.jobLocation;
          if (loc?.address) {
            const addr = loc.address;
            location = location || [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(", ");
          }
        }
      }
    } catch {}
  });

  if (!title) {
    title = $('meta[property="og:title"]').attr("content") || "";
  }
  if (!title) {
    title = $("h1").first().text().trim();
  }
  if (!title) {
    title = $("title").text().trim().split("|")[0].split("-")[0].trim();
  }

  if (!company) {
    company = $('meta[property="og:site_name"]').attr("content") || "";
  }
  if (!company) {
    company = $('[class*="company" i]').first().text().trim() ||
              $('[data-testid*="company" i]').first().text().trim() || "";
  }

  if (!description) {
    const descSelectors = [
      '[class*="description" i]',
      '[id*="description" i]',
      '[class*="job-details" i]',
      '[class*="jobDescription" i]',
      "article",
    ];
    for (const sel of descSelectors) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length > 100) {
        description = cleanText(el.text());
        break;
      }
    }
  }

  if (!description) {
    const metaDesc = $('meta[name="description"]').attr("content") ||
                     $('meta[property="og:description"]').attr("content") || "";
    if (metaDesc.length > 50) {
      description = metaDesc;
    }
  }

  if (!location) {
    location = $('[class*="location" i]').first().text().trim() || "";
  }

  const combinedText = `${title} ${description} ${location}`;
  const workMode = detectWorkMode(combinedText);
  const source = detectSource(url);

  if (description.length > 20000) {
    description = description.substring(0, 20000);
  }

  return {
    title: title || "Untitled Position",
    company: company || "Unknown Company",
    location: location.substring(0, 200),
    workMode,
    datePosted: datePosted || new Date().toISOString().split("T")[0],
    description,
    source,
    applyLink: url,
  };
}

interface EmailJob {
  title: string;
  company: string;
  location: string;
  applyLink: string;
  source: string;
}

export function parseEmailContent(emailText: string): EmailJob[] {
  const jobs: EmailJob[] = [];
  const lines = emailText.split("\n");

  const urlRegex = /https?:\/\/[^\s<>"]+/g;
  const allUrls = emailText.match(urlRegex) || [];
  const jobUrls = allUrls.filter((url) => {
    const lower = url.toLowerCase();
    return lower.includes("job") || lower.includes("career") || lower.includes("position") ||
           lower.includes("apply") || lower.includes("linkedin.com/jobs") ||
           lower.includes("indeed.com") || lower.includes("glassdoor.com") ||
           lower.includes("lever.co") || lower.includes("greenhouse.io") ||
           lower.includes("workday") || lower.includes("icims");
  });

  const jobPattern = /(?:^|\n)\s*(?:(?:•|·|-|\d+[.)]\s*))?\s*(.+?)\s+(?:at|@|-|–|—)\s+(.+?)(?:\s*[-–—|,]\s*(.+?))?(?:\s*\n|$)/gim;
  let match;

  while ((match = jobPattern.exec(emailText)) !== null) {
    const rawTitle = match[1].trim();
    const rawCompany = match[2].trim();
    const rawLocation = (match[3] || "").trim();

    if (rawTitle.length > 5 && rawTitle.length < 100 && rawCompany.length > 1 && rawCompany.length < 80) {
      const titleLower = rawTitle.toLowerCase();
      if (titleLower.includes("analyst") || titleLower.includes("engineer") ||
          titleLower.includes("developer") || titleLower.includes("manager") ||
          titleLower.includes("specialist") || titleLower.includes("coordinator") ||
          titleLower.includes("director") || titleLower.includes("scientist") ||
          titleLower.includes("associate") || titleLower.includes("consultant") ||
          titleLower.includes("lead") || titleLower.includes("intern") ||
          titleLower.includes("architect") || titleLower.includes("designer")) {
        jobs.push({
          title: rawTitle.replace(/[•·\-\d.)]/g, "").trim(),
          company: rawCompany.replace(/[•·\-]/g, "").trim(),
          location: rawLocation.replace(/[•·\-]/g, "").trim(),
          applyLink: "",
          source: "Email Alert",
        });
      }
    }
  }

  const titleCompanyPattern = /(?:^|\n)\s*(?:(?:•|·|-|\*)\s+)?([A-Z][A-Za-z\s&\/]+(?:Analyst|Engineer|Developer|Manager|Specialist|Scientist|Lead|Director|Associate|Coordinator|Consultant|Architect|Designer|Intern)[A-Za-z\s]*)\s*(?:\n|,|\|)\s*(?:Company:|at\s+)?([A-Z][A-Za-z\s&.,]+?)(?:\s*(?:\n|,|\|)\s*(?:Location:|in\s+)?([A-Za-z\s,.]+?))?(?:\s*\n|$)/gm;

  while ((match = titleCompanyPattern.exec(emailText)) !== null) {
    const rawTitle = match[1].trim();
    const rawCompany = match[2].trim();
    const rawLocation = (match[3] || "").trim();

    if (!jobs.some((j) => j.title === rawTitle && j.company === rawCompany)) {
      jobs.push({
        title: rawTitle,
        company: rawCompany,
        location: rawLocation,
        applyLink: "",
        source: "Email Alert",
      });
    }
  }

  if (jobUrls.length > 0 && jobs.length === 0) {
    for (const url of jobUrls) {
      jobs.push({
        title: "",
        company: "",
        location: "",
        applyLink: url,
        source: "Email Alert",
      });
    }
  } else if (jobUrls.length > 0 && jobs.length > 0) {
    for (let i = 0; i < Math.min(jobs.length, jobUrls.length); i++) {
      if (!jobs[i].applyLink) {
        jobs[i].applyLink = jobUrls[i];
      }
    }
  }

  return jobs;
}

export function parseBulkInput(input: string): Array<{ url?: string; title?: string; company?: string; description?: string }> {
  const items: Array<{ url?: string; title?: string; company?: string; description?: string }> = [];
  const urlRegex = /https?:\/\/[^\s<>"]+/g;

  const urls = input.match(urlRegex);
  if (urls && urls.length > 0) {
    for (const url of urls) {
      items.push({ url });
    }
    return items;
  }

  const blocks = input.split(/\n{2,}/).filter((b) => b.trim().length > 10);
  for (const block of blocks) {
    const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 1) {
      const firstLine = lines[0];
      const titleMatch = firstLine.match(/^(.+?)(?:\s+(?:at|@|-|–|—)\s+(.+))?$/);
      items.push({
        title: titleMatch?.[1]?.trim() || firstLine,
        company: titleMatch?.[2]?.trim() || (lines.length > 1 ? lines[1] : ""),
        description: lines.slice(2).join("\n"),
      });
    }
  }

  return items;
}
