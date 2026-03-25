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
  datePosted: string;
  source: string;
  description: string;
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
    const sorted = new URLSearchParams([...parsed.searchParams.entries()].sort());
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    const search = sorted.toString() ? `?${sorted.toString()}` : "";
    return `${parsed.hostname.toLowerCase()}${pathname}${search}`.toLowerCase();
  } catch {
    return url.toLowerCase().trim().replace(/\/+$/, "");
  }
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
// Output field parser — maps cheap_scraper actor fields to our schema
// ---------------------------------------------------------------------------

function parseRawJob(raw: Record<string, any>): LinkedInJobResult {
  // Use the actor's primary output field names first (from output schema).
  // Coerce to string and trim; leave as "" if truly absent/null — the import
  // route has its own last-resort fallbacks so we don't bake placeholder
  // strings ("Untitled Position" etc.) into the parsed result unnecessarily.
  const title = String(raw.jobTitle ?? raw.title ?? raw.position ?? "").trim();

  const company = String(raw.companyName ?? raw.company ?? "").trim();

  const location = String(raw.location ?? raw.jobLocation ?? raw.city ?? "").trim();

  // applyUrl is the direct application link; jobUrl is the LinkedIn posting URL
  const applyLink = String(raw.applyUrl ?? raw.jobUrl ?? raw.url ?? raw.link ?? "").trim();

  // publishedAt is ISO 8601 (primary); fall back to postedTime (human-readable string)
  const rawDate = raw.publishedAt ?? raw.postedTime ?? raw.postedAt ?? raw.datePosted ?? "";
  const datePosted = extractDate(String(rawDate));

  const description = String(raw.jobDescription ?? raw.description ?? raw.descriptionText ?? raw.snippet ?? "").trim();

  return { title, company, location, applyLink, datePosted, source: "LinkedIn", description };
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
    console.log(`[Apify] First item keys: ${Object.keys(data[0]).join(", ")}`);
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
