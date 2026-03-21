/**
 * LinkedIn Jobs search via Apify.
 *
 * Default actor: bebity~linkedin-jobs-scraper
 *   https://apify.com/bebity/linkedin-jobs-scraper
 *
 * If you prefer a different actor, update APIFY_ACTOR_ID and adjust
 * buildActorInput() and parseRawJob() to match that actor's schema.
 */

const APIFY_ACTOR_ID = "bebity~linkedin-jobs-scraper";

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
// ---------------------------------------------------------------------------

function parseRawJob(raw: Record<string, any>, role: string): LinkedInJobResult {
  const title =
    raw.title ||
    raw.jobTitle ||
    raw.position ||
    role;

  const companyRaw = raw.company ?? raw.companyName ?? raw.employer ?? {};
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

  const rawDate =
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
// Public API: search one role via Apify
// ---------------------------------------------------------------------------

export async function searchLinkedInJobsByRole(
  role: string,
  location: string,
  apifyToken: string,
): Promise<LinkedInJobResult[]> {
  const endpoint =
    `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(apifyToken)}&timeout=120`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildActorInput(role, location)),
    signal: AbortSignal.timeout(130_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Apify error ${response.status} for role "${role}": ${body.slice(0, 300)}`,
    );
  }

  const data = await response.json();
  if (!Array.isArray(data)) return [];

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

  return deduped;
}
