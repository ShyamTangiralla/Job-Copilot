/**
 * LinkedIn Jobs search via Apify.
 *
 * Actor: cheap_scraper~linkedin-job-scraper
 *   "LinkedIn Jobs Scraper | Remove Duplicate Jobs | Pay Per Result"
 *   https://apify.com/cheap_scraper/linkedin-job-scraper
 *
 * Flow: send all roles in one run → poll until SUCCEEDED → fetch dataset items
 *
 * Input schema:
 *   keywords        – string[] — job titles / search terms
 *   location        – string  — location string
 *   publishedAt     – string  — "r86400" (24h) | "r604800" (1 week) | "r2592000" (1 month)
 *   maxItems        – integer — max results (min 150 for pay-per-result billing)
 *   saveOnlyUniqueItems – boolean — deduplicate output (default false)
 *
 * Output schema (key fields):
 *   jobTitle, companyName, location, jobUrl, applyUrl,
 *   publishedAt (ISO 8601), postedTime (human), jobDescription,
 *   contractType, experienceLevel, workType, applicationsCount,
 *   posterFullName, posterProfileUrl
 */

const APIFY_ACTOR_ID = "cheap_scraper~linkedin-job-scraper";
const APIFY_BASE = "https://api.apify.com/v2";
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 180_000; // 3 minutes — this actor is thorough

export interface LinkedInJobResult {
  title: string;
  company: string;
  location: string;
  applyLink: string;
  jobUrl: string;
  datePosted: string;
  source: string;
  description: string;
  dedupeKey: string;
}

// ---------------------------------------------------------------------------
// URL normalisation (for within-batch dedup)
// ---------------------------------------------------------------------------

function normalizeForDedup(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "fbclid", "gclid", "mc_cid", "mc_eid", "trk", "trkCampaign"].forEach(p =>
      parsed.searchParams.delete(p),
    );
    const sorted = new URLSearchParams(Array.from(parsed.searchParams.entries()).sort());
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    const search = sorted.toString() ? `?${sorted.toString()}` : "";
    return `${parsed.hostname.toLowerCase()}${pathname}${search}`.toLowerCase();
  } catch {
    return url.toLowerCase().trim().replace(/\/+$/, "");
  }
}

// ---------------------------------------------------------------------------
// LinkedIn job ID extractor — most reliable cross-run dedup key
// ---------------------------------------------------------------------------

export function extractLinkedInJobId(url: string): string {
  if (!url) return "";
  const match = url.match(/linkedin\.com\/jobs\/view\/(\d+)/i);
  return match ? match[1] : "";
}

// ---------------------------------------------------------------------------
// LinkedIn page-title parser
// Handles patterns like:
//   "Aquent hiring Data Analyst [208392] in United States | LinkedIn"
//   "Data Analyst at Aquent | LinkedIn"
//   "Senior Data Scientist | Stripe | LinkedIn"
// Returns { cleanTitle, cleanCompany } extracted from the raw page title.
// ---------------------------------------------------------------------------

function parseLinkedInPageTitle(raw: string): { cleanTitle: string; cleanCompany: string } {
  const s = raw.replace(/\[\d+\]/g, "").trim(); // strip "[208392]" job-ID suffixes

  // Pattern: "COMPANY hiring TITLE in LOCATION | LinkedIn"
  const hiringMatch = s.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+.+?\s*\|/i);
  if (hiringMatch) {
    return { cleanTitle: hiringMatch[2].trim(), cleanCompany: hiringMatch[1].trim() };
  }

  // Pattern: "TITLE at COMPANY | LinkedIn"
  const atMatch = s.match(/^(.+?)\s+at\s+(.+?)\s*\|/i);
  if (atMatch) {
    return { cleanTitle: atMatch[1].trim(), cleanCompany: atMatch[2].trim() };
  }

  // Pattern: "TITLE | COMPANY | LinkedIn"
  const doublePipe = s.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*LinkedIn/i);
  if (doublePipe) {
    return { cleanTitle: doublePipe[1].trim(), cleanCompany: doublePipe[2].trim() };
  }

  // Pattern: "TITLE | LinkedIn"
  const singlePipe = s.match(/^(.+?)\s*\|/);
  if (singlePipe) {
    return { cleanTitle: singlePipe[1].trim(), cleanCompany: "" };
  }

  return { cleanTitle: s, cleanCompany: "" };
}

// ---------------------------------------------------------------------------
// Actor input builder
// ---------------------------------------------------------------------------

function buildActorInput(roles: string[], location: string): object {
  return {
    keywords: roles,
    location: location || "United States",
    publishedAt: "r604800",      // past week
    maxItems: 150,               // minimum for pay-per-result billing
    saveOnlyUniqueItems: true,   // let actor deduplicate by default
  };
}

// ---------------------------------------------------------------------------
// Comprehensive field extractor — tries every field name variant in priority
// order, trims, and returns "" if nothing is found. Never returns a fallback
// placeholder string; that's the caller's responsibility.
// ---------------------------------------------------------------------------

function pickStr(raw: Record<string, any>, ...keys: string[]): string {
  for (const key of keys) {
    const val = raw[key];
    if (val !== null && val !== undefined) {
      const s = String(val).trim();
      if (s) return s;
    }
  }
  return "";
}

function parseRawJob(raw: Record<string, any>): LinkedInJobResult {
  // ── URL fields first — needed for title/company fallback extraction ─────
  // Prefer the direct external apply URL; fall back to the LinkedIn posting URL.
  const applyUrl = pickStr(raw,
    "applyUrl",           // cheap_scraper: external apply URL
    "externalApplyLink",
    "apply_url",
    "applyLink",          // pre-parsed (if object was already mapped)
  );
  const jobUrl = pickStr(raw,
    "jobUrl",             // cheap_scraper: LinkedIn posting URL
    "linkedinUrl",
    "url",
    "link",
    "jobLink",
  );
  const applyLink = applyUrl || jobUrl;

  // ── Raw page title (may contain company+job info even when other fields null) ──
  const rawPageTitle = pickStr(raw, "title");
  const parsedFromTitle = rawPageTitle ? parseLinkedInPageTitle(rawPageTitle) : { cleanTitle: "", cleanCompany: "" };

  // ── Job title ──────────────────────────────────────────────────────────
  // Priority: explicit jobTitle field → other semantic names → parse from page title
  const titleFromFields = pickStr(raw,
    "jobTitle",           // cheap_scraper documented output field
    "positionTitle",
    "position",
    "job_title",
    "role",
    "jobName",
    "name",
  );
  const title = titleFromFields || parsedFromTitle.cleanTitle || rawPageTitle || "";

  // ── Company ────────────────────────────────────────────────────────────
  const companyFromFields = pickStr(raw,
    "companyName",        // cheap_scraper documented output field
    "company",
    "company_name",
    "employer",
    "organization",
    "hiringOrganization",
    "companyTitle",
  );
  const company = companyFromFields || parsedFromTitle.cleanCompany || "";

  // ── Location ───────────────────────────────────────────────────────────
  const location = pickStr(raw,
    "location",           // cheap_scraper documented output field
    "jobLocation",
    "city",
    "geoText",
    "locationText",
    "country",
    "place",
  );

  // ── Date ───────────────────────────────────────────────────────────────
  const rawDate = pickStr(raw,
    "publishedAt",        // cheap_scraper: ISO 8601
    "postedAt",
    "datePosted",
    "date",
    "postedTime",         // human-readable "2 days ago"
    "timeAgo",
    "posted",
    "createdAt",
  );
  const datePosted = extractDate(rawDate);

  // ── Description ────────────────────────────────────────────────────────
  const description = pickStr(raw,
    "jobDescription",     // cheap_scraper documented output field
    "description",
    "descriptionText",
    "snippet",
    "summary",
    "details",
    "body",
    "text",
  );

  // ── dedupeKey: LinkedIn job ID → normalized URL → fingerprint ─────────
  // LinkedIn job IDs are unique and stable across re-runs — most reliable key.
  const liJobId = extractLinkedInJobId(jobUrl) || extractLinkedInJobId(applyUrl);
  let dedupeKey = "";
  if (liJobId) {
    dedupeKey = `li:${liJobId}`;
  } else if (applyLink) {
    dedupeKey = `url:${normalizeForDedup(applyLink)}`;
  } else if (title && company) {
    dedupeKey = `fp:${title.toLowerCase().trim()}|${company.toLowerCase().trim()}|${datePosted}`;
  }

  return { title, company, location, applyLink, jobUrl, datePosted, source: "LinkedIn", description, dedupeKey };
}

function extractDate(raw: string): string {
  if (!raw) return new Date().toISOString().split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Poll a single Apify run until it finishes or times out
// ---------------------------------------------------------------------------

async function waitForRun(
  runId: string,
  token: string,
): Promise<{ status: string; defaultDatasetId: string }> {
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > MAX_WAIT_MS) {
      throw new Error(`Apify run ${runId} timed out after ${MAX_WAIT_MS / 1000}s`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    const status: string = pollData?.data?.status ?? "";
    const datasetId: string = pollData?.data?.defaultDatasetId ?? "";

    if (status === "SUCCEEDED" || status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      return { status, defaultDatasetId: datasetId };
    }

    console.log(`[Apify] Run ${runId} status: ${status} — still waiting...`);
  }
}

// ---------------------------------------------------------------------------
// Debug interface returned to the frontend
// ---------------------------------------------------------------------------

export interface SearchDebugInfo {
  actorId: string;
  rolesSent: string[];
  locationSent: string;
  payload: object;
  runId: string;
  datasetId: string;
  rawItemCount: number;
  status: string;
  error?: string;
}

export interface SearchLinkedInResult {
  jobs: LinkedInJobResult[];
  debug: SearchDebugInfo;
}

// ---------------------------------------------------------------------------
// Public API: run one actor call for all roles, return jobs + debug info
// ---------------------------------------------------------------------------

export async function searchLinkedInJobs(
  roles: string[],
  location: string,
  apifyToken: string,
): Promise<SearchLinkedInResult> {
  const token = encodeURIComponent(apifyToken);
  const payload = buildActorInput(roles, location);

  const debug: SearchDebugInfo = {
    actorId: APIFY_ACTOR_ID,
    rolesSent: roles,
    locationSent: location || "United States",
    payload,
    runId: "",
    datasetId: "",
    rawItemCount: 0,
    status: "pending",
  };

  console.log(`[Apify] ── Starting LinkedIn search ──`);
  console.log(`[Apify] actorId: ${APIFY_ACTOR_ID}`);
  console.log(`[Apify] Roles: ${roles.join(", ")}`);
  console.log(`[Apify] Location: ${location || "United States"}`);
  console.log(`[Apify] Exact JSON payload sent:\n${JSON.stringify(payload, null, 2)}`);

  // 1. Start the actor run
  const startRes = await fetch(
    `${APIFY_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!startRes.ok) {
    const body = await startRes.text().catch(() => "");
    debug.status = "start_failed";
    debug.error = `HTTP ${startRes.status}: ${body.slice(0, 400)}`;
    console.error(`[Apify] Failed to start run — HTTP ${startRes.status}: ${body.slice(0, 400)}`);
    throw new Error(`Apify start failed (${startRes.status}): ${body.slice(0, 300)}`);
  }

  const startData = await startRes.json();
  const runId: string = startData?.data?.id ?? "";
  const initialDatasetId: string = startData?.data?.defaultDatasetId ?? "";
  debug.runId = runId;

  console.log(`[Apify] Run started — runId: ${runId}`);

  // 2. Poll until the run completes
  const { status, defaultDatasetId } = await waitForRun(runId, token);
  const datasetId = defaultDatasetId || initialDatasetId;
  debug.status = status;
  debug.datasetId = datasetId;

  console.log(`[Apify] Run finished — status: ${status}, datasetId: ${datasetId}`);

  if (status !== "SUCCEEDED") {
    debug.error = `Run ended with status: ${status}`;
    throw new Error(`Apify run ${runId} ended with status: ${status}`);
  }

  if (!datasetId) {
    debug.error = "No datasetId returned after SUCCEEDED";
    throw new Error(`Apify run ${runId} succeeded but no datasetId returned`);
  }

  // 3. Fetch dataset items
  const itemsRes = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}`,
    { signal: AbortSignal.timeout(30_000) },
  );

  if (!itemsRes.ok) {
    const body = await itemsRes.text().catch(() => "");
    debug.error = `Dataset fetch HTTP ${itemsRes.status}`;
    throw new Error(`Apify dataset fetch error ${itemsRes.status}: ${body.slice(0, 300)}`);
  }

  const data = await itemsRes.json();

  if (!Array.isArray(data)) {
    console.warn(`[Apify] Dataset response is not an array — got: ${typeof data}`);
    debug.rawItemCount = 0;
    return { jobs: [], debug };
  }

  debug.rawItemCount = data.length;
  console.log(`[Apify] Dataset items fetched: ${data.length} (datasetId: ${datasetId})`);

  if (data.length > 0) {
    const first = data[0] as Record<string, any>;
    console.log(`[Apify] ── First raw item field names: ${Object.keys(first).join(", ")}`);
    // Log every non-description field so we can see the exact values
    for (const [k, v] of Object.entries(first)) {
      if (k === "jobDescription" || k === "description" || k === "descriptionText") {
        console.log(`[Apify]   ${k} = (${String(v ?? "").length} chars)`);
      } else {
        console.log(`[Apify]   ${k} = ${JSON.stringify(v)}`);
      }
    }
    // Log what parseRawJob resolves for the first item
    const parsed = parseRawJob(first);
    console.log(`[Apify] ── First item after parseRawJob ──`);
    console.log(`[Apify]   title       = ${JSON.stringify(parsed.title)}`);
    console.log(`[Apify]   company     = ${JSON.stringify(parsed.company)}`);
    console.log(`[Apify]   location    = ${JSON.stringify(parsed.location)}`);
    console.log(`[Apify]   applyLink   = ${JSON.stringify(parsed.applyLink)}`);
    console.log(`[Apify]   jobUrl      = ${JSON.stringify(parsed.jobUrl)}`);
    console.log(`[Apify]   datePosted  = ${JSON.stringify(parsed.datePosted)}`);
    console.log(`[Apify]   dedupeKey   = ${JSON.stringify(parsed.dedupeKey)}`);
    console.log(`[Apify]   description = (${parsed.description.length} chars)`);
  } else {
    console.log(`[Apify] Dataset is empty — actor returned 0 jobs`);
  }

  // Parse and dedup within the batch
  const allJobs = data.map((item: Record<string, any>) => parseRawJob(item));

  const seen = new Set<string>();
  const deduped: LinkedInJobResult[] = [];

  for (const job of allJobs) {
    if (!job.applyLink) {
      deduped.push(job);
      continue;
    }
    const key = normalizeForDedup(job.applyLink);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(job);
    }
  }

  console.log(`[Apify] ── Done: ${deduped.length} unique jobs (raw dataset: ${data.length}) ──`);

  return { jobs: deduped, debug };
}
