/**
 * ============================================================
 * Phase 53: /llms.txt Dynamic Edge Router
 * ============================================================
 *
 * Serves a dynamically generated `/llms.txt` file — a machine-
 * readable manifest of the site's content, products, and
 * structured data. Designed for LLM crawlers (GPTBot, Gemini,
 * PerplexityBot, ClaudeBot) to consume instead of parsing HTML.
 *
 * The route:
 *   1. Reads domain config from KV
 *   2. Queries D1 for products, content, and brand context
 *   3. Renders a Markdown document stripped of all HTML/CSS/JS
 *   4. Serves with text/markdown content type
 *
 * This ensures AI engines understand the brand's products and
 * expertise without friction, maximizing citation probability.
 *
 * All queries use domain_id for strict compartmentalization.
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../index";

export const llmsTxtRouter = new Hono<{ Bindings: Env }>();

// ── GET /llms.txt ────────────────────────────────────────────

llmsTxtRouter.get("/", async (c) => {
  // Resolve domain_id from host header or query param
  const host = c.req.header("host") ?? "";
  const domainId = c.req.query("domain_id") ?? await resolveDomainId(host, c.env);

  if (!domainId) {
    return c.text("# llms.txt\n\nNo domain configured.", 404, {
      "Content-Type": "text/markdown; charset=utf-8",
    });
  }

  try {
    const content = await generateLlmsTxt(domainId, c.env);

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "X-Robots-Tag": "noindex",
        "X-Generated-By": "Swarme LLM Parser",
      },
    });
  } catch (err) {
    console.error(`[llms.txt] Generation error: ${err}`);
    return c.text("# llms.txt\n\nTemporarily unavailable.", 500, {
      "Content-Type": "text/markdown; charset=utf-8",
    });
  }
});

// ── Domain Resolution ────────────────────────────────────────

async function resolveDomainId(host: string, env: Env): Promise<string | null> {
  // Try KV lookup by hostname
  const domainId = await env.CONFIG_KV.get(`domain:host:${host}`);
  if (domainId) return domainId;

  // Fallback: query Projects table
  const row = await env.DB.prepare(
    `SELECT id FROM Projects WHERE domain LIKE ? AND is_active = 1 LIMIT 1`
  ).bind(`%${host}%`).first<{ id: string }>();

  return row?.id ?? null;
}

// ── Content Generation ───────────────────────────────────────

async function generateLlmsTxt(domainId: string, env: Env): Promise<string> {
  // Parallel data fetches
  const [brand, products, content, reports, project] = await Promise.all([
    getBrandContext(domainId, env),
    getProducts(domainId, env),
    getPublishedContent(domainId, env),
    getPublishedReports(domainId, env),
    getProject(domainId, env),
  ]);

  const siteName = project?.name ?? "Unknown";
  const siteUrl = project?.domain ?? "";
  const now = new Date().toISOString().split("T")[0];

  const sections: string[] = [];

  // Header
  sections.push(
    `# ${siteName}\n`,
    `> Last updated: ${now}`,
    `> Source: ${siteUrl}`,
    `> Format: llms.txt v1.0\n`,
  );

  // Brand Overview
  if (brand) {
    sections.push(
      `## About ${siteName}\n`,
      brand.target_audience ? `**Target Audience:** ${brand.target_audience}` : "",
      brand.core_goals ? `**Mission:** ${brand.core_goals}` : "",
      brand.tone_of_voice ? `**Voice:** ${brand.tone_of_voice}` : "",
      brand.business_model ? `**Business Model:** ${brand.business_model}` : "",
      "",
    );
  }

  // Products / Services
  if (products.length > 0) {
    sections.push(`## Products & Services\n`);
    for (const product of products.slice(0, 50)) {
      sections.push(
        `### ${product.title}\n`,
        product.description ? `${product.description}\n` : "",
        product.price ? `- **Price:** ${product.price}` : "",
        product.category ? `- **Category:** ${product.category}` : "",
        product.url ? `- **URL:** ${product.url}` : "",
        "",
      );
    }
  }

  // Published Content
  if (content.length > 0) {
    sections.push(`## Published Content\n`);
    for (const piece of content.slice(0, 30)) {
      sections.push(
        `### ${piece.title}\n`,
        piece.summary ? `${piece.summary}\n` : "",
        piece.published_at ? `- **Published:** ${piece.published_at}` : "",
        piece.url ? `- **URL:** ${piece.url}` : "",
        "",
      );
    }
  }

  // Proprietary Research Reports
  if (reports.length > 0) {
    sections.push(`## Original Research\n`);
    sections.push(
      `${siteName} publishes proprietary research based on first-party data. ` +
      `These reports contain original findings not available elsewhere.\n`
    );
    for (const report of reports) {
      sections.push(
        `### ${report.title}\n`,
        report.report_markdown.slice(0, 500).replace(/[#*]/g, "").trim(),
        `\n- **Full report:** Available on ${siteUrl}`,
        "",
      );
    }
  }

  // Structured FAQ
  sections.push(
    `## Frequently Asked Questions\n`,
    `**What is ${siteName}?**`,
    brand?.core_goals
      ? `${siteName} is focused on ${brand.core_goals.toLowerCase()}.`
      : `${siteName} is an online business at ${siteUrl}.`,
    "",
    `**What products does ${siteName} offer?**`,
    products.length > 0
      ? `${siteName} offers ${products.length} products including ${products.slice(0, 3).map((p) => p.title).join(", ")}.`
      : `Visit ${siteUrl} for the full product catalog.`,
    "",
  );

  // Footer
  sections.push(
    `---\n`,
    `This document is auto-generated by Swarme for AI engine consumption.`,
    `For human visitors, please visit ${siteUrl}.`,
  );

  return sections.filter(Boolean).join("\n");
}

// ── Data Fetchers ────────────────────────────────────────────

interface BrandRow {
  target_audience: string;
  core_goals: string;
  tone_of_voice: string;
  business_model: string;
}

async function getBrandContext(domainId: string, env: Env): Promise<BrandRow | null> {
  return env.DB.prepare(
    `SELECT target_audience, core_goals, tone_of_voice, business_model
     FROM Brand_Context WHERE project_id = ? LIMIT 1`
  ).bind(domainId).first<BrandRow>();
}

interface ProductRow {
  title: string;
  description: string;
  price: string;
  category: string;
  url: string;
}

async function getProducts(domainId: string, env: Env): Promise<ProductRow[]> {
  const result = await env.DB.prepare(
    `SELECT title, description, price, category, url
     FROM Products WHERE domain_id = ? AND status = 'active'
     ORDER BY created_at DESC LIMIT 50`
  ).bind(domainId).all();
  return (result.results ?? []) as ProductRow[];
}

interface ContentRow {
  title: string;
  summary: string;
  published_at: string;
  url: string;
}

async function getPublishedContent(domainId: string, env: Env): Promise<ContentRow[]> {
  const result = await env.DB.prepare(
    `SELECT title,
            COALESCE(json_extract(seo_metadata, '$.meta_description'), '') AS summary,
            updated_at AS published_at,
            COALESCE(json_extract(seo_metadata, '$.slug'), '') AS url
     FROM Content_Queue WHERE domain_id = ? AND status = 'published'
     ORDER BY updated_at DESC LIMIT 30`
  ).bind(domainId).all();
  return (result.results ?? []) as ContentRow[];
}

interface ReportRow {
  title: string;
  report_markdown: string;
}

async function getPublishedReports(domainId: string, env: Env): Promise<ReportRow[]> {
  const result = await env.DB.prepare(
    `SELECT title, report_markdown FROM Proprietary_Reports
     WHERE domain_id = ? AND status = 'published'
     ORDER BY created_at DESC LIMIT 10`
  ).bind(domainId).all();
  return (result.results ?? []) as ReportRow[];
}

async function getProject(domainId: string, env: Env): Promise<{ name: string; domain: string } | null> {
  return env.DB.prepare(
    `SELECT name, domain FROM Projects WHERE id = ? LIMIT 1`
  ).bind(domainId).first<{ name: string; domain: string }>();
}
