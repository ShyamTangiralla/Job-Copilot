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

function buildActorInput(role: string, location: string) {
  return {
    searchQueries: [
      {
        searchQuery: role,
        location: location || "United States",
        dateSincePosted: "past-24h",
      },
    ],
    maxItems: 50,
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

export async function searchLinkedInJobsByRole(
  role: string,
  location: string,
  apifyToken: string,
): Promise<LinkedInJobResult[]> {
  const token = encodeURIComponent(apifyToken);

  console.log(`[Apify] Starting run — actorId: ${APIFY_ACTOR_ID}, role: "${role}"`);

  // 1. Start the actor run
  const startRes = await fetch(
    `${APIFY_BASE}/acts/${APIFY_ACTOR_ID}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildActorInput(role, location)),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!startRes.ok) {
    const body = await startRes.text().catch(() => "");
    throw new Error(`Apify start error ${startRes.status} for role "${role}": ${body.slice(0, 300)}`);
  }

  const startData = await startRes.json();
  const runId: string = startData?.data?.id ?? "";
  const initialDatasetId: string = startData?.data?.defaultDatasetId ?? "";

  console.log(`[Apify] Run started — runId: ${runId}`);

  // 2. Poll until the run completes
  const { status, defaultDatasetId } = await waitForRun(runId, token);
  const datasetId = defaultDatasetId || initialDatasetId;

  console.log(`[Apify] Run finished — status: ${status}, datasetId: ${datasetId}`);

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run ${runId} ended with status: ${status}`);
  }

  if (!datasetId) {
    throw new Error(`Apify run ${runId} succeeded but no datasetId was returned`);
  }

  // 3. Fetch dataset items
  const itemsRes = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}`,
    { signal: AbortSignal.timeout(30_000) },
  );

  if (!itemsRes.ok) {
    const body = await itemsRes.text().catch(() => "");
    throw new Error(`Apify dataset fetch error ${itemsRes.status}: ${body.slice(0, 300)}`);
  }

  const data = await itemsRes.json();
  if (!Array.isArray(data)) {
    console.log(`[Apify] Dataset returned non-array response for role "${role}"`);
    return [];
  }

  console.log(`[Apify] Fetched ${data.length} items from datasetId: ${datasetId}`);

  return data.map((item: Record<string, any>) => parseRawJob(item, role));
}

// ---------------------------------------------------------------------------
// Public API: search multiple roles, dedup within batch
// ---------------------------------------------------------------------------

export async function searchLinkedInJobs(
  roles: string[],
  location: string,
  apifyToken: string,
): Promise<LinkedInJobResult[]> {
  // Run all roles in parallel — each Apify run is independent
  const perRoleResults = await Promise.allSettled(
    roles.map(role => searchLinkedInJobsByRole(role, location, apifyToken)),
  );

  const allJobs: LinkedInJobResult[] = [];
  const errors: string[] = [];

  for (let i = 0; i < perRoleResults.length; i++) {
    const result = perRoleResults[i];
    if (result.status === "fulfilled") {
      allJobs.push(...result.value);
    } else {
      errors.push(`Role "${roles[i]}": ${result.reason?.message ?? result.reason}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`[Apify] Some roles failed:\n${errors.join("\n")}`);
  }

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

  console.log(`[Apify] Total jobs imported: ${deduped.length} (after dedup from ${allJobs.length})`);

  return deduped;
}
