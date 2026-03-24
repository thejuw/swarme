/**
 * utils/auditor.ts — Phase 11: Autonomous Site Audit Engine
 *
 * Uses Cloudflare Browser Rendering /crawl endpoint to deep-crawl
 * a project's domain, then Workers AI to extract structured SEO,
 * performance, accessibility, and security findings.
 *
 * The /crawl endpoint is async:
 *   POST to start → returns job ID
 *   GET to poll → returns crawl results when ready
 *
 * We request `formats: ["json"]` with a `jsonOptions.prompt` to have
 * Workers AI extract structured audit data directly from the page.
 */

import type { Env } from "../index";

// ─── Types ───────────────────────────────────────────────

export interface AuditFinding {
  category: "performance" | "seo" | "accessibility" | "security" | "content";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  selector?: string;
}

export interface RoadmapItem {
  priority: number;
  title: string;
  description: string;
  category: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
}

export interface DeepAuditResult {
  healthScore: number;
  findings: AuditFinding[];
  roadmap: RoadmapItem[];
  pagesCrawled: number;
  auditedUrl: string;
  rawCrawlData?: unknown;
}

// ─── /crawl API types ────────────────────────────────────

interface CrawlStartResponse {
  success: boolean;
  result: string; // job ID (REST API returns { success: true, result: "uuid" })
  id?: string;    // Fallback for legacy response shape
}

interface CrawlPollResponse {
  id?: string;
  status: "running" | "completed" | "complete" | "errored" | "error"
    | "cancelled_due_to_timeout" | "cancelled_due_to_limits" | "cancelled";
  data?: CrawlPageResult[];   // REST API returns data[] for completed jobs
  result?: CrawlPageResult[]; // Legacy response shape
  error?: string;
  total?: number;
  finished?: number;
  browserSecondsUsed?: number;
}

interface CrawlPageResult {
  url: string;
  json?: Record<string, unknown>;
  text?: string;
  html?: string;
  metadata?: {
    title?: string;
    description?: string;
    statusCode?: number;
    headers?: Record<string, string>;
  };
}

// ─── AI extraction prompt ────────────────────────────────

const AUDIT_EXTRACTION_PROMPT = `Analyze this webpage as an expert SEO auditor. Return a JSON object with these exact keys:

{
  "title": "page title",
  "metaDescription": "meta description text or empty string",
  "h1Count": number of h1 tags,
  "h2Count": number of h2 tags,
  "imgCount": number of images,
  "imgsMissingAlt": number of images without alt text,
  "hasCanonical": boolean,
  "hasRobotsMeta": boolean,
  "hasStructuredData": boolean,
  "hasOpenGraph": boolean,
  "hasTwitterCard": boolean,
  "hasSitemap": boolean,
  "hasViewport": boolean,
  "isHttps": boolean,
  "hasMixedContent": boolean,
  "brokenLinks": number of links that appear broken (404 href patterns),
  "externalLinks": number of external links,
  "internalLinks": number of internal links,
  "wordCount": approximate word count of main content,
  "loadTimeIndicators": "fast" | "medium" | "slow" based on page complexity,
  "issues": [{"type": "string", "detail": "string", "severity": "critical|high|medium|low"}]
}

Be thorough. Check meta tags, heading hierarchy, image alt attributes, structured data, canonical tags, OpenGraph, robots directives, and content quality signals.`;

// ─── Core audit function ─────────────────────────────────

/**
 * runDeepAudit — crawls the given URL via Cloudflare Browser Rendering
 * /crawl endpoint, extracts SEO data with Workers AI, and produces
 * a scored audit result with findings and a prioritised roadmap.
 */
export async function runDeepAudit(
  url: string,
  env: Env
): Promise<DeepAuditResult> {
  const auditedUrl = normalizeUrl(url);

  // ── Step 1: Start crawl via Cloudflare Browser Rendering REST API ──
  // The /crawl endpoint is a REST API at api.cloudflare.com, NOT the
  // Worker BROWSER binding (which is for Puppeteer/Playwright).
  const accountId = env.CF_ACCOUNT_ID;
  const apiToken = env.CF_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error("CF_ACCOUNT_ID and CF_API_TOKEN are required for site audits. Set them via wrangler secret.");
  }

  const crawlResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/crawl`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: auditedUrl,
        limit: 5,
        depth: 2,
        formats: ["json"],
        render: true,
        rejectResourceTypes: ["image", "media", "font", "stylesheet"],
        jsonOptions: {
          prompt: AUDIT_EXTRACTION_PROMPT,
        },
      }),
    },
  );

  if (!crawlResponse.ok) {
    const errText = await crawlResponse.text();
    throw new Error(`/crawl start failed (${crawlResponse.status}): ${errText}`);
  }

  const crawlStart = (await crawlResponse.json()) as CrawlStartResponse;
  const jobId = crawlStart.result || crawlStart.id;

  if (!jobId) {
    throw new Error("/crawl did not return a job ID");
  }

  // ── Step 2: Poll for results ──
  const crawlResults = await pollCrawlJob(jobId, env);

  // ── Step 3: Analyze extracted data → findings ──
  const findings: AuditFinding[] = [];

  for (const page of crawlResults) {
    const data = page.json ?? {};
    analyzePageData(data, page.url ?? auditedUrl, findings);
  }

  // ── Step 4: Compute health score ──
  const healthScore = computeHealthScore(findings);

  // ── Step 5: Generate prioritised roadmap ──
  const roadmap = generateRoadmap(findings);

  return {
    healthScore,
    findings,
    roadmap,
    pagesCrawled: crawlResults.length,
    auditedUrl,
    rawCrawlData: crawlResults.map((p) => ({
      url: p.url,
      metadata: p.metadata,
      json: p.json,
    })),
  };
}

// ─── Polling helper ──────────────────────────────────────

async function pollCrawlJob(
  jobId: string,
  env: Env,
  maxAttempts = 30,
  intervalMs = 5000
): Promise<CrawlPageResult[]> {
  const accountId = env.CF_ACCOUNT_ID;
  const apiToken = env.CF_API_TOKEN;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/crawl/${jobId}`,
      {
        method: "GET",
        headers: { "Authorization": `Bearer ${apiToken}` },
      },
    );

    if (!res.ok) {
      throw new Error(`/crawl poll failed (${res.status}): ${await res.text()}`);
    }

    const body = (await res.json()) as { success: boolean; result: CrawlPollResponse };
    const poll = body.result || (body as any);

    if (poll.status === "completed" && poll.data) {
      return poll.data;
    }

    // Also handle the older response shape
    if ((poll.status === "complete" || poll.status === "completed") && poll.result) {
      return poll.result;
    }

    if (poll.status === "errored" || poll.status === "error") {
      throw new Error(`/crawl job failed: ${poll.error ?? "Unknown error"}`);
    }

    if (poll.status === "cancelled_due_to_timeout" || poll.status === "cancelled_due_to_limits") {
      throw new Error(`/crawl job cancelled: ${poll.status}`);
    }

    // Still running — wait and retry
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`/crawl job timed out after ${maxAttempts} attempts`);
}

// ─── Page analysis ───────────────────────────────────────

function analyzePageData(
  data: Record<string, unknown>,
  pageUrl: string,
  findings: AuditFinding[]
): void {
  const prefix = pageUrl.length > 60 ? pageUrl.slice(0, 57) + "..." : pageUrl;

  // ── SEO checks ──

  if (!data.metaDescription || (data.metaDescription as string).length === 0) {
    findings.push({
      category: "seo",
      severity: "high",
      title: "Missing meta description",
      detail: `${prefix} has no meta description. Search engines use this for snippet display.`,
    });
  } else if ((data.metaDescription as string).length > 160) {
    findings.push({
      category: "seo",
      severity: "medium",
      title: "Meta description too long",
      detail: `${prefix} meta description is ${(data.metaDescription as string).length} chars (max 160).`,
    });
  }

  if ((data.h1Count as number) === 0) {
    findings.push({
      category: "seo",
      severity: "critical",
      title: "Missing H1 tag",
      detail: `${prefix} has no H1 heading. Every page needs exactly one H1.`,
    });
  } else if ((data.h1Count as number) > 1) {
    findings.push({
      category: "seo",
      severity: "medium",
      title: "Multiple H1 tags",
      detail: `${prefix} has ${data.h1Count} H1 tags. Best practice is exactly one.`,
    });
  }

  if (!data.hasCanonical) {
    findings.push({
      category: "seo",
      severity: "high",
      title: "Missing canonical tag",
      detail: `${prefix} lacks a canonical URL tag. Risk of duplicate content.`,
    });
  }

  if (!data.hasStructuredData) {
    findings.push({
      category: "seo",
      severity: "medium",
      title: "No structured data (JSON-LD/Schema)",
      detail: `${prefix} has no structured data markup. Add JSON-LD for rich results.`,
    });
  }

  if (!data.hasOpenGraph) {
    findings.push({
      category: "seo",
      severity: "low",
      title: "Missing OpenGraph tags",
      detail: `${prefix} lacks OG tags. Social sharing will use default appearance.`,
    });
  }

  if (!data.hasTwitterCard) {
    findings.push({
      category: "seo",
      severity: "low",
      title: "Missing Twitter Card meta",
      detail: `${prefix} has no Twitter Card meta tags.`,
    });
  }

  // ── Accessibility checks ──

  if ((data.imgsMissingAlt as number) > 0) {
    findings.push({
      category: "accessibility",
      severity: "high",
      title: "Images missing alt text",
      detail: `${prefix} has ${data.imgsMissingAlt} image(s) without alt attributes.`,
    });
  }

  if (!data.hasViewport) {
    findings.push({
      category: "accessibility",
      severity: "critical",
      title: "Missing viewport meta tag",
      detail: `${prefix} lacks a viewport meta tag. Mobile rendering will be broken.`,
    });
  }

  // ── Security checks ──

  if (!data.isHttps) {
    findings.push({
      category: "security",
      severity: "critical",
      title: "Not served over HTTPS",
      detail: `${prefix} is not using HTTPS. Google penalises insecure pages.`,
    });
  }

  if (data.hasMixedContent) {
    findings.push({
      category: "security",
      severity: "high",
      title: "Mixed content detected",
      detail: `${prefix} loads resources over HTTP on an HTTPS page.`,
    });
  }

  // ── Content checks ──

  if ((data.wordCount as number) < 300) {
    findings.push({
      category: "content",
      severity: "medium",
      title: "Thin content",
      detail: `${prefix} has only ~${data.wordCount} words. Pages under 300 words often rank poorly.`,
    });
  }

  if ((data.brokenLinks as number) > 0) {
    findings.push({
      category: "content",
      severity: "high",
      title: "Broken links detected",
      detail: `${prefix} has ${data.brokenLinks} potential broken link(s).`,
    });
  }

  // ── Performance indicators ──

  if (data.loadTimeIndicators === "slow") {
    findings.push({
      category: "performance",
      severity: "high",
      title: "Slow page load indicators",
      detail: `${prefix} shows signs of heavy page weight or complex rendering.`,
    });
  }

  // ── AI-extracted issues ──
  const aiIssues = data.issues as Array<{
    type: string;
    detail: string;
    severity: string;
  }> | undefined;

  if (Array.isArray(aiIssues)) {
    for (const issue of aiIssues.slice(0, 10)) {
      findings.push({
        category: "seo",
        severity: normalizeSeverity(issue.severity),
        title: issue.type || "AI-detected issue",
        detail: issue.detail || "",
      });
    }
  }
}

// ─── Health score calculation ────────────────────────────

function computeHealthScore(findings: AuditFinding[]): number {
  // Start at 100, deduct for findings by severity
  let score = 100;
  const deductions: Record<string, number> = {
    critical: 15,
    high: 8,
    medium: 4,
    low: 2,
  };

  for (const f of findings) {
    score -= deductions[f.severity] ?? 2;
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Roadmap generation ──────────────────────────────────

function generateRoadmap(findings: AuditFinding[]): RoadmapItem[] {
  // Sort findings: critical first, then high, medium, low
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const sorted = [...findings].sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  // Deduplicate by title (keep highest severity)
  const seen = new Set<string>();
  const unique: AuditFinding[] = [];
  for (const f of sorted) {
    if (!seen.has(f.title)) {
      seen.add(f.title);
      unique.push(f);
    }
  }

  return unique.map((f, idx) => ({
    priority: idx + 1,
    title: f.title,
    description: f.detail,
    category: f.category,
    effort: mapEffort(f),
    impact: mapImpact(f),
  }));
}

// ─── Helpers ─────────────────────────────────────────────

function normalizeUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

function normalizeSeverity(
  s: string
): "critical" | "high" | "medium" | "low" {
  const lower = (s || "").toLowerCase();
  if (lower === "critical") return "critical";
  if (lower === "high") return "high";
  if (lower === "medium") return "medium";
  return "low";
}

function mapEffort(f: AuditFinding): "low" | "medium" | "high" {
  // Simple heuristic: content/seo meta fixes are low effort,
  // performance/security are higher
  if (f.category === "seo" && f.severity !== "critical") return "low";
  if (f.category === "content") return "low";
  if (f.category === "accessibility") return "low";
  if (f.category === "performance") return "high";
  if (f.category === "security") return "medium";
  return "medium";
}

function mapImpact(f: AuditFinding): "low" | "medium" | "high" {
  if (f.severity === "critical") return "high";
  if (f.severity === "high") return "high";
  if (f.severity === "medium") return "medium";
  return "low";
}
