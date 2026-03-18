/**
 * ============================================================
 * Swarme — Phase 64: Cloudflare Logpush Configuration Utility
 * ============================================================
 *
 * Configures Cloudflare's native Logpush service via the API to
 * stream raw infrastructure logs directly to R2.
 *
 * Two log datasets are configured:
 *
 *   1. HTTP Request Logs — every inbound request to the Worker,
 *      including method, path, status, latency, country, TLS
 *      version, etc. Captures traffic even if the Worker crashes
 *      before writing to D1.
 *
 *   2. Workers Trace Events — granular per-invocation traces
 *      including console logs, exceptions, subrequests, and
 *      Durable Object interactions. The full execution telemetry
 *      for every Worker invocation.
 *
 * Destination: R2 bucket `swarme-media` under the path:
 *   cf-logs/{dataset}/{YYYY}/{MM}/{DD}/
 *
 * This module exposes:
 *   - createLogpushJob()    — creates a Logpush job for a dataset
 *   - listLogpushJobs()     — lists all active Logpush jobs
 *   - deleteLogpushJob()    — removes a Logpush job by ID
 *   - setupAllLogpushJobs() — one-shot provisioning of both datasets
 *
 * IMPORTANT: These functions require the Cloudflare API Token
 * with "Logs > Edit" permissions. The token is passed as a
 * parameter (sourced from env secrets), never hardcoded.
 *
 * This is an INFRASTRUCTURE setup utility — it runs once during
 * initial provisioning or via an admin endpoint, not on every
 * request. Think of it like a Terraform apply for Logpush.
 * ============================================================
 */

// ── Types ───────────────────────────────────────────────────

interface LogpushJob {
  id: number;
  dataset: string;
  destination_conf: string;
  enabled: boolean;
  name: string;
  logpull_options: string;
  frequency: string;
}

interface LogpushApiResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: LogpushJob | LogpushJob[] | null;
}

interface LogpushSetupResult {
  httpRequestsJobId: number | null;
  workersTraceJobId: number | null;
  errors: string[];
}

// ── Constants ───────────────────────────────────────────────

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Datasets we want streamed to R2 for compliance.
 * Each maps to a specific Cloudflare log category.
 */
const LOGPUSH_DATASETS = [
  {
    name: "swarme-http-requests",
    dataset: "http_requests",
    /** Fields that capture everything an SOC 2 auditor wants */
    fields: [
      "ClientIP",
      "ClientRequestHost",
      "ClientRequestMethod",
      "ClientRequestURI",
      "EdgeResponseStatus",
      "EdgeStartTimestamp",
      "EdgeEndTimestamp",
      "OriginResponseStatus",
      "RayID",
      "ClientCountry",
      "ClientSSLProtocol",
      "EdgeColoCode",
      "CacheStatus",
      "WAFAction",
      "WAFRuleID",
    ].join(","),
  },
  {
    name: "swarme-workers-trace",
    dataset: "workers_trace_events",
    /** Captures full Worker execution traces including exceptions */
    fields: [
      "Event",
      "EventTimestampMs",
      "EventType",
      "Exceptions",
      "Logs",
      "Outcome",
      "ScriptName",
      "ScriptTags",
    ].join(","),
  },
] as const;

// ── API Helpers ─────────────────────────────────────────────

/**
 * Create a Logpush job that streams the specified dataset to R2.
 *
 * The destination_conf format for R2:
 *   r2://{account_id}/{bucket_name}/{path}?{opts}
 *
 * Access is granted via an R2 access key ID + secret, or via
 * Logpush's native R2 integration (which uses the account's
 * own access).
 */
export async function createLogpushJob(params: {
  accountId: string;
  apiToken: string;
  bucketName: string;
  dataset: string;
  jobName: string;
  fields: string;
}): Promise<{ success: boolean; jobId: number | null; error?: string }> {
  const { accountId, apiToken, bucketName, dataset, jobName, fields } = params;

  // R2 destination using Logpush's native bucket binding
  const destinationConf = `r2://${accountId}/${bucketName}/cf-logs/${dataset}/{DATE}`;

  const response = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/logpush/jobs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: jobName,
        destination_conf: destinationConf,
        dataset,
        logpull_options: `fields=${fields}&timestamps=rfc3339`,
        enabled: true,
        frequency: "low", // 5-min batches (low = cost-efficient)
      }),
    },
  );

  const data = (await response.json()) as LogpushApiResponse;

  if (!data.success) {
    const errMsg = data.errors?.map((e) => e.message).join("; ") || "Unknown Logpush error";
    console.error(`[Logpush] Failed to create job "${jobName}": ${errMsg}`);
    return { success: false, jobId: null, error: errMsg };
  }

  const job = data.result as LogpushJob;
  console.log(`[Logpush] Created job "${jobName}" (ID: ${job.id}) → dataset: ${dataset}`);
  return { success: true, jobId: job.id };
}

/**
 * List all active Logpush jobs for the account.
 */
export async function listLogpushJobs(
  accountId: string,
  apiToken: string,
): Promise<LogpushJob[]> {
  const response = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/logpush/jobs`,
    {
      headers: { Authorization: `Bearer ${apiToken}` },
    },
  );

  const data = (await response.json()) as LogpushApiResponse;
  if (!data.success) return [];
  return (data.result as LogpushJob[]) || [];
}

/**
 * Delete a Logpush job by ID.
 */
export async function deleteLogpushJob(
  accountId: string,
  apiToken: string,
  jobId: number,
): Promise<boolean> {
  const response = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/logpush/jobs/${jobId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiToken}` },
    },
  );

  const data = (await response.json()) as LogpushApiResponse;
  return data.success;
}

/**
 * One-shot provisioning: create both HTTP Request and Workers
 * Trace Logpush jobs pointing to the R2 bucket.
 *
 * Idempotent — if jobs with the same name already exist, they
 * are skipped (no duplicates created).
 *
 * Call this from an admin endpoint or a manual setup script:
 *
 *   POST /api/admin/logpush/setup
 *   { "cf_api_token": "..." }
 */
export async function setupAllLogpushJobs(params: {
  accountId: string;
  apiToken: string;
  bucketName: string;
}): Promise<LogpushSetupResult> {
  const { accountId, apiToken, bucketName } = params;
  const result: LogpushSetupResult = {
    httpRequestsJobId: null,
    workersTraceJobId: null,
    errors: [],
  };

  // Check for existing jobs to avoid duplicates
  const existingJobs = await listLogpushJobs(accountId, apiToken);
  const existingNames = new Set(existingJobs.map((j) => j.name));

  for (const cfg of LOGPUSH_DATASETS) {
    if (existingNames.has(cfg.name)) {
      const existing = existingJobs.find((j) => j.name === cfg.name);
      console.log(
        `[Logpush] Job "${cfg.name}" already exists (ID: ${existing?.id}). Skipping.`,
      );
      if (cfg.dataset === "http_requests") result.httpRequestsJobId = existing?.id ?? null;
      if (cfg.dataset === "workers_trace_events") result.workersTraceJobId = existing?.id ?? null;
      continue;
    }

    const jobResult = await createLogpushJob({
      accountId,
      apiToken,
      bucketName,
      dataset: cfg.dataset,
      jobName: cfg.name,
      fields: cfg.fields,
    });

    if (jobResult.success) {
      if (cfg.dataset === "http_requests") result.httpRequestsJobId = jobResult.jobId;
      if (cfg.dataset === "workers_trace_events") result.workersTraceJobId = jobResult.jobId;
    } else {
      result.errors.push(`${cfg.name}: ${jobResult.error}`);
    }
  }

  return result;
}
