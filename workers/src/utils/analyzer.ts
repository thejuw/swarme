/**
 * utils/analyzer.ts — Phase 13: Public Accessibility Analyzer
 *
 * A lightweight, public-facing site analysis engine that uses
 * Cloudflare Browser Rendering /crawl endpoint to extract
 * SEO + accessibility + performance signals from any URL.
 *
 * This is the engine behind the free PLG lead-magnet tool.
 * Unlike the full `auditor.ts` (which crawls multiple pages
 * for authenticated projects), this analyzes a single URL
 * with a focused extraction prompt — fast and free.
 *
 * Flow:
 *   POST /crawl → poll GET → parse → score → return
 */

import type { Env } from "../index";

// ─── Types ────────────────────────────────────────────────

export interface AnalyzerFinding {
  category: "seo" | "accessibility" | "performance" | "security" | "content";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
}

export interface AnalyzerResult {
  overallScore: number;
  seoScore: number;
  accessibilityScore: number;
  performanceScore: number;
  securityScore: number;
  findings: AnalyzerFinding[];
  pageTitle: string;
  analyzedUrl: string;
  wordCount: number;
  loadTimeIndicator: "fast" | "medium" | "slow";
}

// ─── /crawl API types (shared with auditor.ts) ───────────

interface CrawlStartResponse {
  success: boolean;
  id: string;
}

interface CrawlPollResponse {
  success: boolean;
  status: "pending" | "complete" | "error";
  result?: CrawlPageResult[];
  error?: string;
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
  };
}

// ─── Extraction prompt ────────────────────────────────────

const ANALYZER_EXTRACTION_PROMPT = `Analyze this webpage for SEO, accessibility, performance, and security signals. Return a JSON object with these exact keys:

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
  "hasViewport": boolean,
  "isHttps": boolean,
  "hasMixedContent": boolean,
  "hasLangAttr": boolean,
  "hasAriaLabels": boolean,
  "formsMissingLabels": number,
  "colorContrastIssues": number (estimated),
  "brokenLinks": number,
  "externalLinks": number,
  "internalLinks": number,
  "wordCount": approximate word count,
  "loadTimeIndicators": "fast" | "medium" | "slow",
  "hasFocusOutlines": boolean,
  "hasSkipNav": boolean,
  "tabOrder": "logical" | "unclear" | "broken"
}

Be thorough. Check heading hierarchy, alt text, ARIA landmarks, form labels, color contrast estimates, skip-navigation links, focus indicators, structured data, canonical tags, viewport, and content quality.`;

// ─── Core analysis function ──────────────────────────────

/**
 * runAccessibilityAnalysis — crawls a single URL via the
 * Cloudflare /crawl endpoint and produces a scored analysis
 * with findings across SEO, accessibility, performance, and security.
 */
export async function runAccessibilityAnalysis(
  url: string,
  env: Env
): Promise<AnalyzerResult> {
  const analyzedUrl = normalizeUrl(url);

  // ── Step 1: Start crawl (single page) ──
  const crawlResponse = await env.BROWSER.fetch(
    "https://browser-rendering.cloudflare.com/crawl",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: analyzedUrl,
        maxPages: 1,
        formats: ["json"],
        jsonOptions: {
          prompt: ANALYZER_EXTRACTION_PROMPT,
        },
        waitForSelector: "body",
        timeout: 20000,
      }),
    }
  );

  if (!crawlResponse.ok) {
    const errText = await crawlResponse.text();
    throw new Error(`/crawl start failed (${crawlResponse.status}): ${errText}`);
  }

  const crawlStart = (await crawlResponse.json()) as CrawlStartResponse;

  if (!crawlStart.success || !crawlStart.id) {
    throw new Error("/crawl did not return a job ID");
  }

  // ── Step 2: Poll for results ──
  const results = await pollCrawlJob(crawlStart.id, env);
  const pageData = results[0]?.json ?? {};

  // ── Step 3: Generate findings ──
  const findings: AnalyzerFinding[] = [];
  analyzePageForPublic(pageData, analyzedUrl, findings);

  // ── Step 4: Compute category scores ──
  const seoScore = computeCategoryScore(findings, "seo");
  const accessibilityScore = computeCategoryScore(findings, "accessibility");
  const performanceScore = computeCategoryScore(findings, "performance");
  const securityScore = computeCategoryScore(findings, "security");
  const contentScore = computeCategoryScore(findings, "content");

  // Weighted overall score
  const overallScore = Math.round(
    seoScore * 0.3 +
    accessibilityScore * 0.25 +
    performanceScore * 0.2 +
    securityScore * 0.15 +
    contentScore * 0.1
  );

  return {
    overallScore,
    seoScore,
    accessibilityScore,
    performanceScore,
    securityScore,
    findings,
    pageTitle: (pageData.title as string) || "Unknown",
    analyzedUrl,
    wordCount: (pageData.wordCount as number) || 0,
    loadTimeIndicator: (pageData.loadTimeIndicators as "fast" | "medium" | "slow") || "medium",
  };
}

// ─── Polling helper ──────────────────────────────────────

async function pollCrawlJob(
  jobId: string,
  env: Env,
  maxAttempts = 15,
  intervalMs = 2000
): Promise<CrawlPageResult[]> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await env.BROWSER.fetch(
      `https://browser-rendering.cloudflare.com/crawl/${jobId}`,
      { method: "GET" }
    );

    if (!res.ok) {
      throw new Error(`/crawl poll failed (${res.status}): ${await res.text()}`);
    }

    const poll = (await res.json()) as CrawlPollResponse;

    if (poll.status === "complete" && poll.result) {
      return poll.result;
    }

    if (poll.status === "error") {
      throw new Error(`/crawl job failed: ${poll.error ?? "Unknown error"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`/crawl job timed out after ${maxAttempts} attempts`);
}

// ─── Page analysis (public-facing, broader than auditor) ─

function analyzePageForPublic(
  data: Record<string, unknown>,
  pageUrl: string,
  findings: AnalyzerFinding[]
): void {
  // ── SEO checks ──

  if (!data.metaDescription || (data.metaDescription as string).length === 0) {
    findings.push({
      category: "seo",
      severity: "high",
      title: "Missing meta description",
      detail: "No meta description found. Search engines use this for result snippets.",
    });
  } else if ((data.metaDescription as string).length > 160) {
    findings.push({
      category: "seo",
      severity: "medium",
      title: "Meta description too long",
      detail: `Meta description is ${(data.metaDescription as string).length} characters (recommended max: 160).`,
    });
  }

  if ((data.h1Count as number) === 0) {
    findings.push({
      category: "seo",
      severity: "critical",
      title: "Missing H1 heading",
      detail: "No H1 tag found. Every page should have exactly one H1 for SEO.",
    });
  } else if ((data.h1Count as number) > 1) {
    findings.push({
      category: "seo",
      severity: "medium",
      title: "Multiple H1 tags",
      detail: `Found ${data.h1Count} H1 tags. Best practice is exactly one per page.`,
    });
  }

  if (!data.hasCanonical) {
    findings.push({
      category: "seo",
      severity: "high",
      title: "Missing canonical tag",
      detail: "No canonical URL tag found. This can cause duplicate content issues.",
    });
  }

  if (!data.hasStructuredData) {
    findings.push({
      category: "seo",
      severity: "medium",
      title: "No structured data",
      detail: "No JSON-LD or Schema.org markup detected. Structured data enables rich search results.",
    });
  }

  if (!data.hasOpenGraph) {
    findings.push({
      category: "seo",
      severity: "low",
      title: "Missing OpenGraph tags",
      detail: "No OG meta tags found. Social media shares will use default appearance.",
    });
  }

  if (!data.hasTwitterCard) {
    findings.push({
      category: "seo",
      severity: "low",
      title: "Missing Twitter Card tags",
      detail: "No Twitter Card meta tags detected.",
    });
  }

  // ── Accessibility checks ──

  if ((data.imgsMissingAlt as number) > 0) {
    findings.push({
      category: "accessibility",
      severity: "high",
      title: "Images missing alt text",
      detail: `${data.imgsMissingAlt} image(s) lack alt attributes. Screen readers cannot describe these images.`,
    });
  }

  if (!data.hasViewport) {
    findings.push({
      category: "accessibility",
      severity: "critical",
      title: "Missing viewport meta tag",
      detail: "No viewport tag found. Mobile rendering will be unreliable.",
    });
  }

  if (!data.hasLangAttr) {
    findings.push({
      category: "accessibility",
      severity: "high",
      title: "Missing lang attribute",
      detail: "The <html> element has no lang attribute. Screen readers need this to set pronunciation.",
    });
  }

  if ((data.formsMissingLabels as number) > 0) {
    findings.push({
      category: "accessibility",
      severity: "high",
      title: "Form inputs missing labels",
      detail: `${data.formsMissingLabels} form field(s) lack associated labels. This hurts usability for assistive technology.`,
    });
  }

  if ((data.colorContrastIssues as number) > 0) {
    findings.push({
      category: "accessibility",
      severity: "medium",
      title: "Color contrast concerns",
      detail: `Approximately ${data.colorContrastIssues} element(s) may have insufficient color contrast (WCAG AA).`,
    });
  }

  if (!data.hasSkipNav) {
    findings.push({
      category: "accessibility",
      severity: "medium",
      title: "No skip navigation link",
      detail: "No skip-to-content link found. Keyboard users must tab through all navigation on every page load.",
    });
  }

  if (!data.hasFocusOutlines) {
    findings.push({
      category: "accessibility",
      severity: "medium",
      title: "Focus outlines may be suppressed",
      detail: "Focus indicators appear to be removed or hidden. Keyboard users cannot see which element is focused.",
    });
  }

  if (data.tabOrder === "broken") {
    findings.push({
      category: "accessibility",
      severity: "high",
      title: "Broken tab order",
      detail: "Tab order does not follow a logical reading sequence. Users navigating via keyboard will be disoriented.",
    });
  }

  // ── Security checks ──

  if (!data.isHttps) {
    findings.push({
      category: "security",
      severity: "critical",
      title: "Not using HTTPS",
      detail: "Page is not served over HTTPS. Browsers flag this as insecure and Google penalises ranking.",
    });
  }

  if (data.hasMixedContent) {
    findings.push({
      category: "security",
      severity: "high",
      title: "Mixed content detected",
      detail: "Some resources load over HTTP on an HTTPS page, creating security vulnerabilities.",
    });
  }

  // ── Performance indicators ──

  if (data.loadTimeIndicators === "slow") {
    findings.push({
      category: "performance",
      severity: "high",
      title: "Slow page load indicators",
      detail: "Page shows signs of heavy weight or complex rendering. Consider optimizing images and scripts.",
    });
  }

  // ── Content checks ──

  if ((data.wordCount as number) < 300) {
    findings.push({
      category: "content",
      severity: "medium",
      title: "Thin content",
      detail: `Only ~${data.wordCount ?? 0} words found. Pages under 300 words often rank poorly.`,
    });
  }

  if ((data.brokenLinks as number) > 0) {
    findings.push({
      category: "content",
      severity: "high",
      title: "Broken links detected",
      detail: `${data.brokenLinks} potential broken link(s) found.`,
    });
  }
}

// ─── Category scoring ────────────────────────────────────

function computeCategoryScore(
  findings: AnalyzerFinding[],
  category: AnalyzerFinding["category"]
): number {
  const catFindings = findings.filter((f) => f.category === category);
  let score = 100;
  const deductions: Record<string, number> = {
    critical: 20,
    high: 12,
    medium: 6,
    low: 3,
  };

  for (const f of catFindings) {
    score -= deductions[f.severity] ?? 3;
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Helpers ─────────────────────────────────────────────

function normalizeUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}
