import * as cheerio from "cheerio";
import { storage } from "./storage";

interface DiscoveredJob {
  title: string;
  company: string;
  source: string;
  location: string;
  workMode: string;
  description: string;
  applyLink: string;
  datePosted: string;
  matchScoreNumeric?: number;
  matchScore?: string;
  freshnessLabel?: string;
  isPrimaryRole?: boolean;
}

interface DiscoveryConfig {
  primaryRoles: string[];
  secondaryRoles: string[];
  preferredLocations: string[];
  workModes: string[];
  maxJobsPerScan: number;
  searchKeywords: string[];
  excludeKeywords: string[];
  jobAgeFilter: string;
  sources: {
    googleJobs: boolean;
    greenhouse: boolean;
    lever: boolean;
    workday: boolean;
    companyCareerPages: boolean;
    emailAlerts: boolean;
  };
  scheduler: string;
  preferredFreshness: string;
  dailyImportCap: number;
}

let activeRunId: number | null = null;
let abortController: AbortController | null = null;

export function isDiscoveryRunning(): boolean {
  return activeRunId !== null;
}

export function stopDiscovery(): void {
  if (abortController) {
    abortController.abort();
  }
  activeRunId = null;
}

function computeFreshnessLabel(datePosted: string): string {
  if (!datePosted) return "Unknown Date";
  const posted = new Date(datePosted);
  if (isNaN(posted.getTime())) return "Unknown Date";
  const now = new Date();
  const hoursAgo = (now.getTime() - posted.getTime()) / (1000 * 60 * 60);
  if (hoursAgo <= 24) return "Fresh 24h";
  if (hoursAgo <= 48) return "Fresh 48h";
  if (hoursAgo <= 72) return "Fresh 72h";
  if (hoursAgo <= 168) return "Fresh 7d";
  return "Too Old";
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

function matchesFilters(job: DiscoveredJob, config: DiscoveryConfig): boolean {
  const combined = `${job.title} ${job.description}`.toLowerCase();

  if (config.excludeKeywords.length > 0) {
    for (const kw of config.excludeKeywords) {
      if (combined.includes(kw.toLowerCase())) return false;
    }
  }

  if (config.searchKeywords.length > 0) {
    const hasKeyword = config.searchKeywords.some((kw) => combined.includes(kw.toLowerCase()));
    if (!hasKeyword) return false;
  }

  if (config.workModes.length > 0 && config.workModes.length < 3) {
    if (!config.workModes.includes(job.workMode)) return false;
  }

  if (config.preferredLocations.length > 0) {
    const jobLoc = job.location.toLowerCase();
    const locationMatch = config.preferredLocations.some((loc) => {
      const locLower = loc.toLowerCase();
      return jobLoc.includes(locLower) || locLower === "remote" && job.workMode === "Remote";
    });
    if (!locationMatch && job.workMode !== "Remote") return false;
  }

  const maxDays = getDaysFromFilter(config.jobAgeFilter);
  if (job.datePosted) {
    const posted = new Date(job.datePosted);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);
    if (!isNaN(posted.getTime()) && posted < cutoff) return false;
  }

  return true;
}

function getDaysFromFilter(filter: string): number {
  switch (filter) {
    case "Last 24 hours": return 1;
    case "Last 3 days": return 3;
    case "Last 7 days": return 7;
    default: return 7;
  }
}

async function searchGreenhouseJobs(roles: string[], config: DiscoveryConfig, signal: AbortSignal): Promise<DiscoveredJob[]> {
  const jobs: DiscoveredJob[] = [];
  const popularBoards = [
    "airbnb", "stripe", "coinbase", "figma", "notion", "databricks",
    "datadog", "hashicorp", "gitlab", "mongodb", "elastic",
    "twilio", "cloudflare", "hubspot", "asana", "gusto",
    "plaid", "brex", "ramp", "scale", "anduril",
    "airtable", "canva", "duolingo", "faire", "grammarly",
    "loom", "miro", "nerdwallet", "pagerduty", "samsara",
    "snyk", "toast", "vanta", "webflow", "zapier",
    "tempus", "flatiron", "cerner", "veracyte", "waystar",
    "aetion", "health-catalyst", "noom", "ro", "hims",
    "devoted-health", "clover-health", "cityblock", "springhealth", "lyrahealth",
  ];

  for (const board of popularBoards) {
    if (signal.aborted || jobs.length >= config.maxJobsPerScan) break;
    try {
      const resp = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, {
        signal,
        headers: { "Accept": "application/json" },
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!data.jobs || !Array.isArray(data.jobs)) continue;

      for (const gJob of data.jobs) {
        if (jobs.length >= config.maxJobsPerScan) break;
        const title = gJob.title || "";
        const titleLower = title.toLowerCase();
        const matchesRole = roles.some((r) => titleLower.includes(r.toLowerCase()));
        if (!matchesRole) continue;

        const location = gJob.location?.name || "";
        const desc = gJob.content ? cheerio.load(gJob.content).text().trim() : "";
        const applyLink = gJob.absolute_url || `https://boards.greenhouse.io/${board}/jobs/${gJob.id}`;

        const job: DiscoveredJob = {
          title,
          company: board.charAt(0).toUpperCase() + board.slice(1),
          source: "Greenhouse",
          location,
          workMode: detectWorkMode(`${title} ${desc} ${location}`),
          description: desc.substring(0, 5000),
          applyLink,
          datePosted: gJob.updated_at?.split("T")[0] || new Date().toISOString().split("T")[0],
        };

        if (matchesFilters(job, config)) {
          jobs.push(job);
        }
      }
    } catch {
      if (signal.aborted) break;
    }
  }

  return jobs;
}

async function searchLeverJobs(roles: string[], config: DiscoveryConfig, signal: AbortSignal): Promise<DiscoveredJob[]> {
  const jobs: DiscoveredJob[] = [];
  const popularCompanies = [
    "netflix", "spotify", "uber", "lyft", "robinhood",
    "doordash", "instacart", "pinterest", "snap", "reddit",
    "discord", "affirm", "chime", "sofi", "plaid",
    "opensea", "ripple", "dbt-labs", "fivetran", "census",
    "komodohealth", "collectivehealth", "omadahealth", "livongo",
    "included-health", "veeva", "doximity", "zocdoc", "healthgorilla",
    "signifyhealth", "suki", "olive", "athenahealth", "allscripts",
    "medidata", "iqvia", "cardinal-health", "mckesson",
    "dropbox", "atlassian", "calendly", "deel", "lattice",
  ];

  for (const company of popularCompanies) {
    if (signal.aborted || jobs.length >= config.maxJobsPerScan) break;
    try {
      const resp = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`, {
        signal,
        headers: { "Accept": "application/json" },
      });
      if (!resp.ok) continue;
      const postings = await resp.json();
      if (!Array.isArray(postings)) continue;

      for (const posting of postings) {
        if (jobs.length >= config.maxJobsPerScan) break;
        const title = posting.text || "";
        const titleLower = title.toLowerCase();
        const matchesRole = roles.some((r) => titleLower.includes(r.toLowerCase()));
        if (!matchesRole) continue;

        const location = posting.categories?.location || "";
        const desc = posting.descriptionPlain || posting.description || "";
        const applyLink = posting.hostedUrl || posting.applyUrl || "";

        const job: DiscoveredJob = {
          title,
          company: company.charAt(0).toUpperCase() + company.slice(1).replace(/-/g, " "),
          source: "Lever",
          location,
          workMode: detectWorkMode(`${title} ${desc} ${location}`),
          description: (typeof desc === "string" ? desc : "").substring(0, 5000),
          applyLink,
          datePosted: posting.createdAt ? new Date(posting.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        };

        if (matchesFilters(job, config)) {
          jobs.push(job);
        }
      }
    } catch {
      if (signal.aborted) break;
    }
  }

  return jobs;
}

async function searchGoogleJobs(roles: string[], config: DiscoveryConfig, signal: AbortSignal): Promise<DiscoveredJob[]> {
  const jobs: DiscoveredJob[] = [];
  const allRoles = roles.slice(0, 3);

  for (const role of allRoles) {
    if (signal.aborted || jobs.length >= config.maxJobsPerScan) break;

    const locations = config.preferredLocations.length > 0 ? config.preferredLocations.slice(0, 2) : ["Remote"];
    for (const loc of locations) {
      if (signal.aborted || jobs.length >= config.maxJobsPerScan) break;
      try {
        const query = encodeURIComponent(`${role} ${loc} jobs`);
        const resp = await fetch(`https://www.google.com/search?q=${query}&ibp=htl;jobs`, {
          signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.5",
          },
        });
        if (!resp.ok) continue;
        const html = await resp.text();
        const $ = cheerio.load(html);

        $('script[type="application/ld+json"]').each((_, el) => {
          if (jobs.length >= config.maxJobsPerScan) return;
          try {
            const data = JSON.parse($(el).html() || "{}");
            const items = data["@type"] === "JobPosting" ? [data] :
                          (Array.isArray(data.itemListElement) ? data.itemListElement.map((i: any) => i.item || i) :
                          (Array.isArray(data) ? data : []));

            for (const item of items) {
              if (item["@type"] !== "JobPosting" || jobs.length >= config.maxJobsPerScan) continue;
              const title = item.title || "";
              const company = typeof item.hiringOrganization === "object" ? item.hiringOrganization?.name || "" : item.hiringOrganization || "";
              const description = item.description ? cheerio.load(item.description).text().trim() : "";
              const location = item.jobLocation?.address?.addressLocality || loc;
              const applyLink = item.url || "";
              const datePosted = item.datePosted || new Date().toISOString().split("T")[0];

              const job: DiscoveredJob = {
                title, company, source: "Google Jobs", location,
                workMode: detectWorkMode(`${title} ${description} ${location}`),
                description: description.substring(0, 5000),
                applyLink, datePosted,
              };

              if (title && company && matchesFilters(job, config)) {
                jobs.push(job);
              }
            }
          } catch {}
        });
      } catch {
        if (signal.aborted) break;
      }
    }
  }

  return jobs;
}

export async function runDiscovery(): Promise<number> {
  if (activeRunId !== null) {
    throw new Error("A discovery run is already in progress");
  }

  const config: DiscoveryConfig = await storage.getDiscoverySettings();
  const allRoles = [...config.primaryRoles, ...config.secondaryRoles];

  if (allRoles.length === 0) {
    throw new Error("No target roles configured. Add roles in discovery settings.");
  }

  abortController = new AbortController();
  const signal = abortController.signal;

  const run = await storage.createDiscoveryRun({
    status: "running",
    jobsFound: 0,
    jobsImported: 0,
    jobsDuplicate: 0,
    jobsFailed: 0,
    sourcesSearched: [],
  });
  activeRunId = run.id;

  (async () => {
    const sourcesSearched: string[] = [];
    let allDiscoveredJobs: DiscoveredJob[] = [];

    try {
      if (config.sources.greenhouse && !signal.aborted) {
        try {
          const ghJobs = await searchGreenhouseJobs(allRoles, config, signal);
          allDiscoveredJobs.push(...ghJobs);
          sourcesSearched.push("Greenhouse");
        } catch {}
      }

      if (config.sources.lever && !signal.aborted) {
        try {
          const leverJobs = await searchLeverJobs(allRoles, config, signal);
          allDiscoveredJobs.push(...leverJobs);
          sourcesSearched.push("Lever");
        } catch {}
      }

      if (config.sources.googleJobs && !signal.aborted) {
        try {
          const googleJobs = await searchGoogleJobs(allRoles, config, signal);
          allDiscoveredJobs.push(...googleJobs);
          sourcesSearched.push("Google Jobs");
        } catch {}
      }

      for (const discovered of allDiscoveredJobs) {
        const scored = storage.classifyAndScore({
          title: discovered.title,
          company: discovered.company,
          source: discovered.source,
          location: discovered.location,
          workMode: discovered.workMode,
          description: discovered.description,
          applyLink: discovered.applyLink,
          status: "New",
        });
        discovered.matchScoreNumeric = scored.matchScoreNumeric;
        discovered.matchScore = scored.fitLabel;
        discovered.freshnessLabel = computeFreshnessLabel(discovered.datePosted);
        const titleLower = discovered.title.toLowerCase();
        discovered.isPrimaryRole = config.primaryRoles.some(r => titleLower.includes(r.toLowerCase()));
      }

      const skippedOld: DiscoveredJob[] = [];
      allDiscoveredJobs = allDiscoveredJobs.filter(job => {
        if (job.freshnessLabel === "Too Old") {
          skippedOld.push(job);
          return false;
        }
        return true;
      });

      const freshnessOrder: Record<string, number> = { "Fresh 24h": 0, "Fresh 48h": 1, "Fresh 72h": 2, "Fresh 7d": 3, "Unknown Date": 4 };
      const matchOrder: Record<string, number> = { "Strong Match": 0, "Possible Match": 1, "Weak Match": 2 };
      allDiscoveredJobs.sort((a, b) => {
        const fa = freshnessOrder[a.freshnessLabel ?? "Unknown Date"] ?? 2;
        const fb = freshnessOrder[b.freshnessLabel ?? "Unknown Date"] ?? 2;
        if (fa !== fb) return fa - fb;
        const ma = matchOrder[a.matchScore ?? "Weak Match"] ?? 2;
        const mb = matchOrder[b.matchScore ?? "Weak Match"] ?? 2;
        if (ma !== mb) return ma - mb;
        const pa = a.isPrimaryRole ? 0 : 1;
        const pb = b.isPrimaryRole ? 0 : 1;
        return pa - pb;
      });

      const importLimit = Math.min(config.maxJobsPerScan, config.dailyImportCap || 150);
      if (allDiscoveredJobs.length > importLimit) {
        allDiscoveredJobs = allDiscoveredJobs.slice(0, importLimit);
      }

      let imported = 0;
      let duplicates = 0;
      let failed = 0;

      for (const old of skippedOld) {
        await storage.createDiscoveryResult({
          runId: run.id,
          jobTitle: old.title,
          jobCompany: old.company,
          source: old.source,
          location: old.location,
          applyLink: old.applyLink,
          importResult: "skipped_old",
          isDuplicate: false,
          classification: "",
          recommendedResume: "",
          matchScore: old.matchScore ?? "",
          freshnessLabel: old.freshnessLabel === "Too Old" ? "Too Old" : old.freshnessLabel ?? "",
        });
      }

      for (const discovered of allDiscoveredJobs) {
        if (signal.aborted) break;

        try {
          const dupCheck = await storage.checkDuplicate(discovered.title, discovered.company, discovered.applyLink, discovered.datePosted);
          if (dupCheck.isDuplicate) {
            duplicates++;
            await storage.createDiscoveryResult({
              runId: run.id,
              jobTitle: discovered.title,
              jobCompany: discovered.company,
              source: discovered.source,
              location: discovered.location,
              applyLink: discovered.applyLink,
              importResult: "duplicate",
              isDuplicate: true,
              classification: "",
              recommendedResume: "",
              matchScore: discovered.matchScore ?? "",
              freshnessLabel: discovered.freshnessLabel ?? "",
              duplicateReason: dupCheck.reason ?? "",
              duplicateJobId: dupCheck.existingJob?.id,
            });
            continue;
          }

          const priorityResult = storage.computeApplyPriorityScore({
            title: discovered.title.toLowerCase(),
            desc: `${discovered.title} ${discovered.description}`.toLowerCase(),
            source: discovered.source.toLowerCase(),
            location: discovered.location.toLowerCase(),
            workMode: discovered.workMode.toLowerCase(),
            freshnessLabel: discovered.freshnessLabel ?? "",
            roleClassification: "",
            resumeRecommendation: "",
          });

          let statusFromScore: string;
          if (priorityResult.applyPriorityScore >= 85) statusFromScore = "Ready to Apply";
          else if (discovered.matchScore === "Strong Match") statusFromScore = "Ready to Apply";
          else if (discovered.matchScore === "Possible Match") statusFromScore = "New";
          else statusFromScore = "New";

          const job = await storage.createJob({
            title: discovered.title,
            company: discovered.company,
            source: discovered.source,
            location: discovered.location,
            workMode: discovered.workMode,
            datePosted: discovered.datePosted,
            description: discovered.description,
            applyLink: discovered.applyLink,
            status: statusFromScore,
            freshnessLabel: discovered.freshnessLabel === "Too Old" ? "Unknown Date" : discovered.freshnessLabel ?? "Unknown Date",
          });

          imported++;
          await storage.createDiscoveryResult({
            runId: run.id,
            jobTitle: job.title,
            jobCompany: job.company,
            source: discovered.source,
            location: discovered.location,
            applyLink: discovered.applyLink,
            importResult: "imported",
            isDuplicate: false,
            classification: job.roleClassification,
            recommendedResume: job.resumeRecommendation,
            matchScore: discovered.matchScore ?? "",
            freshnessLabel: discovered.freshnessLabel ?? "",
            applyPriorityScore: job.applyPriorityScore,
            applyPriorityLabel: job.applyPriorityLabel,
            jobId: job.id,
          });

          await storage.createImportLog({
            sourceType: "discovery",
            sourceUrl: discovered.applyLink,
            status: "success",
            jobId: job.id,
            jobTitle: job.title,
            jobCompany: job.company,
          });
        } catch (err: any) {
          failed++;
          await storage.createDiscoveryResult({
            runId: run.id,
            jobTitle: discovered.title,
            jobCompany: discovered.company,
            source: discovered.source,
            location: discovered.location,
            applyLink: discovered.applyLink,
            importResult: "failed",
            isDuplicate: false,
            matchScore: discovered.matchScore ?? "",
            freshnessLabel: discovered.freshnessLabel ?? "",
            errorMessage: err.message || "Unknown error",
          });
        }
      }

      await storage.updateDiscoveryRun(run.id, {
        status: signal.aborted ? "stopped" : "completed",
        jobsFound: allDiscoveredJobs.length,
        jobsImported: imported,
        jobsDuplicate: duplicates,
        jobsFailed: failed,
        sourcesSearched,
        completedAt: new Date(),
      });
    } catch (err: any) {
      await storage.updateDiscoveryRun(run.id, {
        status: "failed",
        jobsFound: allDiscoveredJobs.length,
        sourcesSearched,
        completedAt: new Date(),
      });
    } finally {
      activeRunId = null;
      abortController = null;
    }
  })();

  return run.id;
}
