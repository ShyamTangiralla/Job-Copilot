/**
 * LinkedIn Jobs search via Apify.
 *
 * Flow: start actor run → poll until SUCCEEDED → fetch dataset items
 * Actor: bebity~linkedin-jobs-scraper
 *   https://apify.com/bebity/linkedin-jobs-scraper
 */

const APIFY_ACTOR_ID = "bebity~linkedin-jobs-scraper";
const APIFY_BASE = "https://api.apify.com/v2";
const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 150_000;

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
// URL normalisation (for within-batch dedup only)
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
// Apify actor input builder
// ---------------------------------------------------------------------------
// Actor schema (bebity/linkedin-jobs-scraper):
//   title        – job title / keywords (string, required)
//   location     – location string (string, required, default: "United States")
//   rows         – number of results (integer, max 1000, default: 50)
//   publishedAt  – time filter: "r86400" (24h) | "r604800" (1 week) | "r2592000" (1 month)
//   companyName  – array of company names (optional)
//   companyId    – array of company LinkedIn IDs (optional)
//   workType     – "1" Onsite | "2" Remote | "3" Hybrid (optional)
//   contractType – "F" Full-time | "P" Part-time | "C" Contract | etc. (optional)
//   proxy        – Apify proxy config (optional)
// ---------------------------------------------------------------------------

function buildActorInput(role: string, location: string) {
  return {
    title: role,
    location: location || "United States",
    rows: 50,
    publishedAt: "r604800", // past week — keeps results fresh without being too narrow
  };
}

// ---------------------------------------------------------------------------
// Raw result parser — handles field name variations across actor versions
// Supports both old field names and new Apify actor fields
// ---------------------------------------------------------------------------

function parseRawJob(raw: Record<string, any>, role: string): LinkedInJobResult {
  // title: jobTitle (new) → title (old) → position → fallback role
  const title =
    raw.jobTitle ||
    raw.title ||
    raw.position ||
    role;

  // company: companyName (new) → company (old) → employer object → "Unknown"
  const companyRaw = raw.companyName ?? raw.company ?? raw.employer ?? {};
  const company =
    typeof companyRaw === "string"
      ? companyRaw
      : (companyRaw as any)?.name || "Unknown Company";

  const location =
    raw.location ||
    raw.jobLocation ||
    raw.city ||
    "";

  const applyLink =
    raw.jobUrl ||
    raw.url ||
    raw.link ||
    raw.applyUrl ||
    raw.applyLink ||
    "";

  // postedTime (new) → postedAt → datePosted → publishedAt
  const rawDate =
    raw.postedTime ||
    raw.postedAt ||
    raw.postedDate ||
    raw.datePosted ||
    raw.publishedAt ||
    "";

  const datePosted = extractDate(rawDate);

  const description =
    raw.description ||
    raw.descriptionText ||
    raw.jobDescription ||
    raw.snippet ||
    "";

  return {
    title: String(title).trim(),
    company: String(company).trim(),
    location: String(location).trim(),
    applyLink: String(applyLink).trim(),
    datePosted,
    source: "LinkedIn",
    description: String(description).trim(),
  };
}

function extractDate(raw: string): string {
  if (!raw) return new Date().toISOString().split("T")[0];
  // Already ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // Try parsing natural-language dates
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

    const pollRes = await fetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${token}`,
    );

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    const status: string = pollData?.data?.status ?? "";
    const datasetId: string = pollData?.data?.defaultDatasetId ?? "";

    if (status === "SUCCEEDED" || status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      return { status, defaultDatasetId: datasetId };
    }
  }
}

// ---------------------------------------------------------------------------
// Public API: search one role via Apify (async run → poll → dataset fetch)
// ---------------------------------------------------------------------------

export interface RoleSearchDebug {
  role: string;
  actorId: string;
  payload: object;
  runId: string;
  datasetId: string;
  rawItemCount: number;
  status: string;
  error?: string;
}

export async function searchLinkedInJobsByRole(
  role: string,
  location: string,
  apifyToken: string,
): Promise<{ jobs: LinkedInJobResult[]; debug: RoleSearchDebug }> {
  const token = encodeURIComponent(apifyToken);
  const payload = buildActorInput(role, location);

  const debug: RoleSearchDebug = {
    role,
    actorId: APIFY_ACTOR_ID,
    payload,
    runId: "",
    datasetId: "",
    rawItemCount: 0,
    status: "pending",
  };

  console.log(`[Apify] ── Starting run ──`);
  console.log(`[Apify] actorId: ${APIFY_ACTOR_ID}`);
  console.log(`[Apify] role: "${role}", location: "${location || "United States"}"`);
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
    debug.error = `HTTP ${startRes.status}: ${body.slice(0, 300)}`;
    console.error(`[Apify] Start error ${startRes.status} for role "${role}": ${body.slice(0, 300)}`);
    throw new Error(`Apify start error ${startRes.status} for role "${role}": ${body.slice(0, 300)}`);
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
    debug.error = "No datasetId returned";
    throw new Error(`Apify run ${runId} succeeded but no datasetId was returned`);
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
    console.log(`[Apify] Dataset returned non-array response for role "${role}"`);
    debug.rawItemCount = 0;
    return { jobs: [], debug };
  }

  debug.rawItemCount = data.length;
  console.log(`[Apify] Dataset items fetched: ${data.length} (datasetId: ${datasetId})`);

  if (data.length > 0) {
    console.log(`[Apify] Sample first item keys: ${Object.keys(data[0]).join(", ")}`);
  } else {
    console.log(`[Apify] Dataset is empty — actor returned 0 jobs for role "${role}"`);
  }

  return { jobs: data.map((item: Record<string, any>) => parseRawJob(item, role)), debug };
}

// ---------------------------------------------------------------------------
// Public API: search multiple roles, dedup within batch
// ---------------------------------------------------------------------------

export interface SearchLinkedInResult {
  jobs: LinkedInJobResult[];
  debugPerRole: RoleSearchDebug[];
  totalRawItems: number;
}

export async function searchLinkedInJobs(
  roles: string[],
  location: string,
  apifyToken: string,
): Promise<SearchLinkedInResult> {
  // Run all roles in parallel — each Apify run is independent
  const perRoleResults = await Promise.allSettled(
    roles.map(role => searchLinkedInJobsByRole(role, location, apifyToken)),
  );

  const allJobs: LinkedInJobResult[] = [];
  const debugPerRole: RoleSearchDebug[] = [];
  const errors: string[] = [];

  for (let i = 0; i < perRoleResults.length; i++) {
    const result = perRoleResults[i];
    if (result.status === "fulfilled") {
      allJobs.push(...result.value.jobs);
      debugPerRole.push(result.value.debug);
    } else {
      errors.push(`Role "${roles[i]}": ${result.reason?.message ?? result.reason}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`[Apify] Some roles failed:\n${errors.join("\n")}`);
  }

  const totalRawItems = debugPerRole.reduce((sum, d) => sum + d.rawItemCount, 0);

  // Deduplicate within the batch using normalised URLs
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

  console.log(`[Apify] ── Search complete: ${deduped.length} unique jobs (raw: ${allJobs.length}, Apify dataset items: ${totalRawItems}) ──`);

  return { jobs: deduped, debugPerRole, totalRawItems };
}
